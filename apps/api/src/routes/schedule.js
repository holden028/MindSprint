const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get time blocks for a date range
router.get('/blocks', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { from, to } = req.query;

    const start = from || new Date().toISOString().slice(0, 10);
    const end = to || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const result = await query(
      `SELECT * FROM time_blocks
       WHERE user_id = $1 AND (
         (starts_at >= $2 AND starts_at < $3)
         OR recurrence_rule IS NOT NULL
       )
       ORDER BY starts_at`,
      [user_id, start, end + 'T23:59:59Z']
    );

    // Expand recurring blocks into the requested range
    const blocks = [];
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end + 'T23:59:59Z');

    for (const block of result.rows) {
      if (!block.recurrence_rule) {
        blocks.push(block);
        continue;
      }
      const expanded = expandRecurringBlock(block, rangeStart, rangeEnd);
      blocks.push(...expanded);
    }

    blocks.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    res.json({ blocks });
  } catch (error) {
    console.error('Get time blocks error:', error);
    res.status(500).json({ error: 'Failed to load time blocks' });
  }
});

function expandRecurringBlock(block, rangeStart, rangeEnd) {
  const rule = block.recurrence_rule;
  if (!rule || !rule.days || rule.days.length === 0) return [block];

  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const targetDays = rule.days.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined);

  const origStart = new Date(block.starts_at);
  const origEnd = new Date(block.ends_at);
  const durationMs = origEnd - origStart;
  const startHour = origStart.getHours();
  const startMin = origStart.getMinutes();

  const instances = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= rangeEnd) {
    if (targetDays.includes(cursor.getDay())) {
      const instanceStart = new Date(cursor);
      instanceStart.setHours(startHour, startMin, 0, 0);
      const instanceEnd = new Date(instanceStart.getTime() + durationMs);

      if (instanceStart >= rangeStart && instanceStart <= rangeEnd) {
        instances.push({
          ...block,
          starts_at: instanceStart.toISOString(),
          ends_at: instanceEnd.toISOString(),
          is_recurring_instance: true
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return instances;
}

// Create time block
router.post('/blocks', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { title, starts_at, ends_at, recurrence_rule } = req.body;

    if (!title || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'title, starts_at, and ends_at are required' });
    }

    const result = await query(
      `INSERT INTO time_blocks (user_id, title, starts_at, ends_at, recurrence_rule)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, title, starts_at, ends_at, recurrence_rule ? JSON.stringify(recurrence_rule) : null]
    );

    res.status(201).json({ block: result.rows[0] });
  } catch (error) {
    console.error('Create time block error:', error);
    res.status(500).json({ error: 'Failed to create time block' });
  }
});

// Update time block
router.put('/blocks/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;
    const { title, starts_at, ends_at, recurrence_rule } = req.body;

    const result = await query(
      `UPDATE time_blocks SET title = COALESCE($1, title), starts_at = COALESCE($2, starts_at),
       ends_at = COALESCE($3, ends_at), recurrence_rule = $4
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [title, starts_at, ends_at, recurrence_rule ? JSON.stringify(recurrence_rule) : null, id, user_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found' });
    res.json({ block: result.rows[0] });
  } catch (error) {
    console.error('Update time block error:', error);
    res.status(500).json({ error: 'Failed to update time block' });
  }
});

// Delete time block
router.delete('/blocks/:id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM time_blocks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, user_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found' });
    res.json({ message: 'Block deleted' });
  } catch (error) {
    console.error('Delete time block error:', error);
    res.status(500).json({ error: 'Failed to delete time block' });
  }
});

// Get available free slots for a date
router.get('/availability', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const dayStart = new Date(targetDate + 'T00:00:00');
    const dayEnd = new Date(targetDate + 'T23:59:59');

    // Get all blocks for the day (including expanded recurring)
    const blocksResult = await query(
      `SELECT * FROM time_blocks
       WHERE user_id = $1 AND (
         (starts_at >= $2 AND starts_at < $3)
         OR recurrence_rule IS NOT NULL
       )`,
      [user_id, dayStart, dayEnd]
    );

    const allBlocks = [];
    for (const block of blocksResult.rows) {
      if (!block.recurrence_rule) {
        allBlocks.push({ start: new Date(block.starts_at), end: new Date(block.ends_at), title: block.title });
      } else {
        const expanded = expandRecurringBlock(block, dayStart, dayEnd);
        for (const inst of expanded) {
          allBlocks.push({ start: new Date(inst.starts_at), end: new Date(inst.ends_at), title: inst.title });
        }
      }
    }

    // Get tasks with sessions for the day (active work)
    const sessionsResult = await query(
      `SELECT s.started_at, s.duration_minutes, t.title FROM sessions s
       JOIN tasks t ON s.task_id = t.id
       WHERE s.user_id = $1 AND s.started_at >= $2 AND s.started_at < $3`,
      [user_id, dayStart, dayEnd]
    );

    for (const s of sessionsResult.rows) {
      const sStart = new Date(s.started_at);
      allBlocks.push({
        start: sStart,
        end: new Date(sStart.getTime() + (s.duration_minutes || 25) * 60000),
        title: `Session: ${s.title}`
      });
    }

    allBlocks.sort((a, b) => a.start - b.start);

    // Compute free slots (assume waking hours 7am-10pm)
    const wakeStart = new Date(targetDate + 'T07:00:00');
    const wakeEnd = new Date(targetDate + 'T22:00:00');
    const freeSlots = [];
    let cursor = wakeStart;

    for (const block of allBlocks) {
      if (block.start < wakeStart || block.start > wakeEnd) continue;
      if (block.start > cursor) {
        freeSlots.push({ start: cursor.toISOString(), end: block.start.toISOString(), minutes: (block.start - cursor) / 60000 });
      }
      if (block.end > cursor) cursor = block.end;
    }
    if (cursor < wakeEnd) {
      freeSlots.push({ start: cursor.toISOString(), end: wakeEnd.toISOString(), minutes: (wakeEnd - cursor) / 60000 });
    }

    const totalFreeMinutes = freeSlots.reduce((sum, s) => sum + s.minutes, 0);

    res.json({ date: targetDate, blocks: allBlocks.map(b => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() })), free_slots: freeSlots, total_free_minutes: totalFreeMinutes });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Failed to compute availability' });
  }
});

module.exports = router;
