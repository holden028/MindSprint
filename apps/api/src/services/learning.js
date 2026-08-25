const { query } = require('../config/database');

const MIN_ENV_SAMPLES = 3;
const MIN_HOUR_SAMPLES = 2;
const MIN_DURATION_SAMPLES = 2;

const ENV_LABELS = {
  music: 'music',
  darkRoom: 'a dark room',
  silence: 'silence',
  phoneOff: 'phone off'
};

function emptyBias() {
  return { less: 0, accurate: 0, more: 0 };
}

function emptyProfile() {
  return {
    sample_count: 0,
    avg_rating: 0,
    avg_focus: 0,
    avg_energy: 0,
    env_stats: {},
    hour_stats: {},
    duration_stats: {},
    distraction_stats: {},
    estimate_bias: emptyBias(),
    best_tip: null
  };
}

function durationBucket(minutes) {
  const m = Number(minutes) || 25;
  if (m < 15) return 'under_15';
  if (m < 30) return '15_30';
  if (m < 60) return '30_60';
  return '60_plus';
}

function durationLabel(bucket) {
  return (
    {
      under_15: 'under 15 minutes',
      '15_30': '15–30 minutes',
      '30_60': '30–60 minutes',
      '60_plus': '60+ minutes'
    }[bucket] || 'similar length'
  );
}

function envLabel(key) {
  if (ENV_LABELS[key]) return ENV_LABELS[key];
  return String(key || '').replace(/_/g, ' ');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bumpStat(stats, key, rating, focus) {
  if (!key) return;
  const prev = stats[key] || { count: 0, sum_rating: 0, sum_focus: 0 };
  stats[key] = {
    count: prev.count + 1,
    sum_rating: prev.sum_rating + (Number(rating) || 0),
    sum_focus: prev.sum_focus + (Number(focus) || 0)
  };
}

function avgFromStat(stat) {
  if (!stat || !stat.count) return 0;
  return stat.sum_rating / stat.count;
}

function rankStats(stats, minSamples = 1) {
  return Object.entries(stats || {})
    .map(([key, stat]) => ({
      key,
      count: stat.count || 0,
      avgRating: avgFromStat(stat),
      avgFocus: stat.count ? (stat.sum_focus || 0) / stat.count : 0
    }))
    .filter((row) => row.count >= minSamples)
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
}

function activeEnvKeys(environment) {
  const env = parseJson(environment, {}) || {};
  return Object.entries(env)
    .filter(([, v]) => v === true || v === 'true' || v === 1)
    .map(([k]) => k);
}

function distractionList(raw) {
  const value = parseJson(raw, raw);
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function runningAvg(prevAvg, prevCount, nextValue) {
  if (nextValue == null || Number.isNaN(Number(nextValue))) {
    return { avg: prevAvg, count: prevCount };
  }
  const n = prevCount + 1;
  const avg = (prevAvg * prevCount + Number(nextValue)) / n;
  return { avg, count: n };
}

function buildTip(profile) {
  if (!profile || profile.sample_count < 3) {
    return 'Complete a few focus sessions with ratings — MindSprint will learn what helps you most.';
  }

  const parts = [];
  const topEnvs = rankStats(profile.env_stats, MIN_ENV_SAMPLES).slice(0, 2);
  const topHour = rankStats(profile.hour_stats, MIN_HOUR_SAMPLES)[0];
  const topDur = rankStats(profile.duration_stats, MIN_DURATION_SAMPLES)[0];
  const topDist = Object.entries(profile.distraction_stats || {})
    .map(([type, count]) => ({ type, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)[0];

  if (topEnvs.length) {
    const labels = topEnvs.map((e) => envLabel(e.key));
    parts.push(
      `You tend to rate highest with ${labels.join(' + ')} (avg ${topEnvs[0].avgRating.toFixed(1)}/10).`
    );
  }
  if (topHour) {
    const h = parseInt(topHour.key, 10);
    parts.push(`Strongest hour so far: ${h}:00–${h + 1}:00.`);
  }
  if (topDur) {
    parts.push(`Sessions of ${durationLabel(topDur.key)} fit you well.`);
  }
  if (topDist && topDist.count >= 2) {
    parts.push(`Watch for ${topDist.type} — your top recorded distraction.`);
  }

  const bias = profile.estimate_bias || emptyBias();
  const biasTotal = (bias.less || 0) + (bias.accurate || 0) + (bias.more || 0);
  if (biasTotal >= 3) {
    if ((bias.more || 0) / biasTotal >= 0.5) {
      parts.push('You often underestimate duration — pad estimates a little.');
    } else if ((bias.less || 0) / biasTotal >= 0.5) {
      parts.push('You often finish faster than estimated — try slightly tighter blocks.');
    }
  }

  return parts.join(' ') || 'Keep logging reflections — your focus profile is building.';
}

async function loadProfileRow(userId) {
  const result = await query('SELECT * FROM focus_profiles WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

function rowToProfile(row) {
  if (!row) return emptyProfile();
  return {
    sample_count: parseInt(row.sample_count, 10) || 0,
    avg_rating: parseFloat(row.avg_rating) || 0,
    avg_focus: parseFloat(row.avg_focus) || 0,
    avg_energy: parseFloat(row.avg_energy) || 0,
    env_stats: parseJson(row.env_stats, {}),
    hour_stats: parseJson(row.hour_stats, {}),
    duration_stats: parseJson(row.duration_stats, {}),
    distraction_stats: parseJson(row.distraction_stats, {}),
    estimate_bias: { ...emptyBias(), ...parseJson(row.estimate_bias, {}) },
    best_tip: row.best_tip || null
  };
}

async function saveProfile(userId, profile) {
  const tip = buildTip(profile);
  profile.best_tip = tip;
  await query(
    `INSERT INTO focus_profiles (
       user_id, sample_count, avg_rating, avg_focus, avg_energy,
       env_stats, hour_stats, duration_stats, distraction_stats, estimate_bias, best_tip, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       sample_count = EXCLUDED.sample_count,
       avg_rating = EXCLUDED.avg_rating,
       avg_focus = EXCLUDED.avg_focus,
       avg_energy = EXCLUDED.avg_energy,
       env_stats = EXCLUDED.env_stats,
       hour_stats = EXCLUDED.hour_stats,
       duration_stats = EXCLUDED.duration_stats,
       distraction_stats = EXCLUDED.distraction_stats,
       estimate_bias = EXCLUDED.estimate_bias,
       best_tip = EXCLUDED.best_tip,
       updated_at = NOW()`,
    [
      userId,
      profile.sample_count,
      profile.avg_rating,
      profile.avg_focus,
      profile.avg_energy,
      JSON.stringify(profile.env_stats),
      JSON.stringify(profile.hour_stats),
      JSON.stringify(profile.duration_stats),
      JSON.stringify(profile.distraction_stats),
      JSON.stringify(profile.estimate_bias),
      tip
    ]
  );
  return profile;
}

function applySessionToProfile(profile, session) {
  const rating = Number(session.self_rating);
  if (!rating && rating !== 0) return profile;

  const focus = session.focus_quality != null ? Number(session.focus_quality) : null;
  const energy = session.energy_level != null ? Number(session.energy_level) : null;
  const minutes = session.actual_duration_minutes || session.duration_minutes || 25;
  const started = session.started_at ? new Date(session.started_at) : new Date();
  const hourKey = String(started.getHours());

  const prevCount = profile.sample_count;
  const ratingAvg = runningAvg(profile.avg_rating, prevCount, rating);
  profile.avg_rating = ratingAvg.avg;
  profile.sample_count = ratingAvg.count;

  if (focus != null) {
    profile.avg_focus = runningAvg(profile.avg_focus, prevCount, focus).avg;
  }
  if (energy != null) {
    profile.avg_energy = runningAvg(profile.avg_energy, prevCount, energy).avg;
  }

  for (const key of activeEnvKeys(session.environment)) {
    bumpStat(profile.env_stats, key, rating, focus || 0);
  }
  bumpStat(profile.hour_stats, hourKey, rating, focus || 0);
  bumpStat(profile.duration_stats, durationBucket(minutes), rating, focus || 0);

  for (const d of distractionList(session.distractions)) {
    profile.distraction_stats[d] = (profile.distraction_stats[d] || 0) + 1;
  }

  return profile;
}

async function loadEstimateBias(userId) {
  const result = await query(
    `SELECT actual_accuracy, COUNT(*)::int as count
     FROM task_estimate_accuracy
     WHERE user_id = $1
     GROUP BY actual_accuracy`,
    [userId]
  );
  const bias = emptyBias();
  for (const row of result.rows) {
    if (bias[row.actual_accuracy] != null) bias[row.actual_accuracy] = row.count;
  }
  return bias;
}

async function rebuildProfile(userId) {
  const sessions = await query(
    `SELECT environment, self_rating, focus_quality, energy_level, distractions,
            actual_duration_minutes, duration_minutes, started_at
     FROM sessions
     WHERE user_id = $1 AND completed = true AND self_rating IS NOT NULL
     ORDER BY started_at ASC`,
    [userId]
  );

  let profile = emptyProfile();
  for (const session of sessions.rows) {
    profile = applySessionToProfile(profile, session);
  }
  profile.estimate_bias = await loadEstimateBias(userId);
  return saveProfile(userId, profile);
}

async function getOrBuildProfile(userId) {
  const row = await loadProfileRow(userId);
  if (row && parseInt(row.sample_count, 10) > 0) {
    return rowToProfile(row);
  }

  const count = await query(
    `SELECT COUNT(*)::int as n FROM sessions
     WHERE user_id = $1 AND completed = true AND self_rating IS NOT NULL`,
    [userId]
  );
  if ((count.rows[0]?.n || 0) > 0) {
    return rebuildProfile(userId);
  }
  return emptyProfile();
}

async function recordSessionEnd(userId, _sessionId) {
  // Full rebuild keeps aggregates accurate and is cheap at personal-session scale
  return rebuildProfile(userId);
}

function suggestedEnvironment(profile, { estMinutes } = {}) {
  const suggested = {};
  const reasons = [];
  const ranked = rankStats(profile.env_stats, MIN_ENV_SAMPLES);

  for (const row of ranked.slice(0, 3)) {
    if (row.avgRating >= 6) {
      suggested[row.key] = true;
      reasons.push(`${envLabel(row.key)} (avg ${row.avgRating.toFixed(1)})`);
    }
  }

  // Soft duration hint — prefer env that also works in matching bucket when possible
  if (estMinutes != null) {
    const bucket = durationBucket(estMinutes);
    const dur = profile.duration_stats?.[bucket];
    if (dur && dur.count >= MIN_DURATION_SAMPLES) {
      reasons.push(`${durationLabel(bucket)} sessions avg ${avgFromStat(dur).toFixed(1)}/10`);
    }
  }

  return {
    environment: suggested,
    reasons,
    tip: profile.best_tip || buildTip(profile),
    sampleCount: profile.sample_count,
    confidence: ranked[0]?.count >= 5 ? 'high' : ranked[0]?.count >= MIN_ENV_SAMPLES ? 'medium' : 'low'
  };
}

async function getSuggestions(userId, opts = {}) {
  const profile = await getOrBuildProfile(userId);
  return suggestedEnvironment(profile, opts);
}

async function getRecommendations(userId) {
  const profile = await getOrBuildProfile(userId);
  const tip = profile.best_tip || buildTip(profile);
  const items = [{ type: 'learning', message: tip }];

  const topEnvs = rankStats(profile.env_stats, MIN_ENV_SAMPLES).slice(0, 2);
  for (const env of topEnvs) {
    items.push({
      type: 'environment',
      message: `Turn on ${envLabel(env.key)} — avg focus rating ${env.avgRating.toFixed(1)}/10 across ${env.count} sessions.`
    });
  }

  const topHour = rankStats(profile.hour_stats, MIN_HOUR_SAMPLES)[0];
  if (topHour) {
    const h = parseInt(topHour.key, 10);
    items.push({
      type: 'timing',
      message: `Protect ${h}:00–${h + 1}:00 for deep work when you can.`
    });
  }

  const topDist = Object.entries(profile.distraction_stats || {})
    .map(([type, count]) => ({ type, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)[0];
  if (topDist && topDist.count >= 2) {
    items.push({
      type: 'distraction',
      message: `${topDist.type} shows up often (${topDist.count}×). Remove it before you start.`
    });
  }

  return { recommendations: items, tip, profile };
}

async function getLearningInsights(userId) {
  const profile = await getOrBuildProfile(userId);
  const envRanked = rankStats(profile.env_stats, 1);
  const hourRanked = rankStats(profile.hour_stats, 1);
  const bestEnv = envRanked[0];
  const bestHour = hourRanked[0];
  const topDist = Object.entries(profile.distraction_stats || {})
    .map(([type, count]) => ({ type, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count);

  const recommendations = [];
  const tip = profile.best_tip || buildTip(profile);
  if (tip) recommendations.push(tip);

  return {
    sampleCount: profile.sample_count,
    tip,
    bestTimeOfDay: bestHour
      ? { hour: parseInt(bestHour.key, 10), sessions: bestHour.count, avgRating: bestHour.avgRating }
      : { hour: 14, sessions: 0, avgRating: 0 },
    bestEnvironment: bestEnv
      ? {
          environment: envLabel(bestEnv.key),
          key: bestEnv.key,
          avgRating: bestEnv.avgRating,
          sessions: bestEnv.count
        }
      : { environment: 'Not enough data yet', avgRating: 0, sessions: 0 },
    avgEnergy: profile.avg_energy || 0,
    avgFocus: profile.avg_focus || 0,
    avgRating: profile.avg_rating || 0,
    hourlyPerformance: hourRanked.map((h) => ({
      hour: parseInt(h.key, 10),
      avgRating: h.avgRating,
      sessions: h.count
    })),
    environmentPerformance: envRanked.map((e) => ({
      environment: envLabel(e.key),
      key: e.key,
      avgRating: e.avgRating,
      sessions: e.count
    })),
    distractionAnalysis: topDist.map((d) => ({
      type: d.type,
      count: d.count,
      percentage: topDist.reduce((s, x) => s + x.count, 0)
        ? ((d.count / topDist.reduce((s, x) => s + x.count, 0)) * 100).toFixed(1)
        : 0
    })),
    topDistraction: topDist[0] || { type: 'None', count: 0 },
    durationPerformance: rankStats(profile.duration_stats, 1).map((d) => ({
      bucket: d.key,
      label: durationLabel(d.key),
      avgRating: d.avgRating,
      sessions: d.count
    })),
    estimateBias: profile.estimate_bias,
    recommendations,
    suggestedEnvironment: suggestedEnvironment(profile).environment
  };
}

module.exports = {
  recordSessionEnd,
  rebuildProfile,
  getOrBuildProfile,
  getSuggestions,
  getRecommendations,
  getLearningInsights,
  buildTip,
  durationBucket
};
