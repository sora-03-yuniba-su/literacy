/* =============================================================================
 * app.js — VO2max 推定ロジック + レースタイム予測 + UI
 *
 * 係数はすべて公開文献に準拠（各関数のコメント参照）。
 * 計算ロジックは純粋関数として独立。Node.js からも require してテストできる。
 * ========================================================================== */

/* ----------------------------- 定数・単位変換 ------------------------------ */
var LB_PER_KG = 2.2046226218;
var M_PER_MILE = 1609.344;

/* ---------------------------- 入力バリデーション --------------------------- */
function assertPositive(value, name) {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
    throw new RangeError(name + ' は正の数値で入力してください。');
  }
}

/**
 * 時間を分（小数）に変換する。
 * 数値 / "13.5" / "13:30" / "1:02:15" を受け付ける。
 */
function parseTimeToMinutes(input) {
  if (typeof input === 'number') {
    assertPositive(input, '時間');
    return input;
  }
  var s = String(input).trim();
  if (s === '') throw new RangeError('時間を入力してください。');
  if (/^\d+(\.\d+)?$/.test(s)) {
    var n = Number(s);
    assertPositive(n, '時間');
    return n;
  }
  var parts = s.split(':').map(Number);
  if (parts.some(isNaN) || parts.length < 2 || parts.length > 3) {
    throw new RangeError('時間は「分:秒」（例 13:30）の形式で入力してください。');
  }
  if (parts.some(function (p) { return p < 0; })) {
    throw new RangeError('時間に負の値は入力できません。');
  }
  return parts.length === 2
    ? parts[0] + parts[1] / 60
    : parts[0] + parts[1] / 60 + parts[2] / 3600;
}

/** 時・分・秒 → 分（小数）。全て0なら NaN を返す（未入力扱い）。 */
function hmsToMinutes(hours, minutes, seconds) {
  var h = isFinite(hours) ? hours : 0;
  var m = isFinite(minutes) ? minutes : 0;
  var s = isFinite(seconds) ? seconds : 0;
  if (h === 0 && m === 0 && s === 0) return NaN;
  if (h < 0 || m < 0 || s < 0) throw new RangeError('時間に負の値は入力できません。');
  return h * 60 + m + s / 60;
}

/** 分（小数）→ "M:SS" または "H:MM:SS" */
function formatMinutesToTime(minutes) {
  if (!isFinite(minutes) || minutes <= 0) return '—';
  var total = Math.round(minutes * 60);
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  function pad(v) { return (v < 10 ? '0' : '') + v; }
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

/** ペース（min/km）→ "M:SS /km" */
function formatPace(minutes, distanceMeters) {
  if (!isFinite(minutes) || minutes <= 0 || !isFinite(distanceMeters) || distanceMeters <= 0) return '—';
  var perKm = minutes / (distanceMeters / 1000);
  return formatMinutesToTime(perKm) + ' /km';
}

/* ------------------------------- 単位変換 --------------------------------- */
function kmToMeters(km) { assertPositive(km, '距離'); return km * 1000; }
function milesToMeters(mi) { assertPositive(mi, '距離'); return mi * M_PER_MILE; }
function lbToKg(lb) { assertPositive(lb, '体重'); return lb / LB_PER_KG; }
function kgToLb(kg) { assertPositive(kg, '体重'); return kg * LB_PER_KG; }
function kmhToMpm(kmh) { assertPositive(kmh, '速度'); return (kmh * 1000) / 60; }
function mphToMpm(mph) { assertPositive(mph, '速度'); return (mph * M_PER_MILE) / 60; }

/* ======================== 1〜5) フィールドテスト系 ========================= */

/**
 * 1) Cooper 12分間走テスト
 * 出典: Cooper KH. JAMA. 1968;203(3):203. / Wikipedia "Cooper test"
 * VO2max = (d12 − 504.9) / 44.73    d12 = 12分間の走行距離[メートル]
 */
function cooper12MinRun(distanceMeters) {
  assertPositive(distanceMeters, '距離');
  return (distanceMeters - 504.9) / 44.73;
}

/**
 * 2) Uth–Sørensen 心拍数比法
 * 出典: Uth N, et al. Eur J Appl Physiol. 2004;91(1):111-5.
 * VO2max = 15.3 × (HRmax / HRrest)
 */
function uthSorensen(hrMax, hrRest) {
  assertPositive(hrMax, '最大心拍数');
  assertPositive(hrRest, '安静時心拍数');
  if (hrRest >= hrMax) {
    throw new RangeError('安静時心拍数は最大心拍数より小さい値にしてください。');
  }
  return 15.3 * (hrMax / hrRest);
}

/** 最大心拍数の簡易推定: 220 − 年齢 */
function estimateHrMax(age) {
  assertPositive(age, '年齢');
  return 220 - age;
}

/**
 * 3) Rockport 1マイル歩行テスト
 * 出典: Kline GM, et al. Med Sci Sports Exerc. 1987;19(3):253-9.
 * VO2max = 132.853 − 0.0769×体重(lb) − 0.3877×年齢
 *          + 6.315×性別(男1/女0) − 3.2649×時間(min) − 0.1565×終了時HR
 */
function rockportWalk(opts) {
  var weight = opts.weight;
  var age = opts.age;
  var sex = opts.sex;
  var endHr = opts.endHr;
  assertPositive(weight, '体重');
  assertPositive(age, '年齢');
  assertPositive(endHr, '終了時心拍数');
  var minutes = parseTimeToMinutes(opts.time);
  var weightLb = opts.weightUnit === 'kg' ? kgToLb(weight) : weight;
  var sexCode = sex === 'male' ? 1 : 0;
  return 132.853
    - 0.0769 * weightLb
    - 0.3877 * age
    + 6.315 * sexCode
    - 3.2649 * minutes
    - 0.1565 * endHr;
}

/**
 * 4) ACSM 走行式（最大努力時のVO2をVO2max推定に使用）
 * 出典: ACSM's Guidelines for Exercise Testing and Prescription /
 *       Koutlianos N, et al. 2013 (PMC3743617)
 * VO2 = 0.2×速度 + 0.9×速度×傾斜 + 3.5
 * 速度: m/min、傾斜: 小数（5% → 0.05）
 */
function acsmRunning(speedMpm, gradeFraction) {
  assertPositive(speedMpm, '速度');
  var g = gradeFraction == null ? 0 : gradeFraction;
  if (typeof g !== 'number' || !isFinite(g) || g < 0) {
    throw new RangeError('傾斜は0以上の数値で入力してください（5% → 5）。');
  }
  return 0.2 * speedMpm + 0.9 * speedMpm * g + 3.5;
}

/**
 * 5) 1.5マイル走テスト
 * 出典: Cooper 系フィールドテスト
 * VO2max = 3.5 + 483 / 時間(min)
 */
function oneAndHalfMileRun(time) {
  var minutes = parseTimeToMinutes(time);
  return 3.5 + 483 / minutes;
}

/* ==================== 6) 20mシャトルラン（2方式） ========================= */

/**
 * 6-a) 文部科学省「新体力テスト」20mシャトルラン
 * 折り返しの総回数 → VO2max
 * 出典: 文部科学省「新体力テスト実施要項」参考
 *       「20mシャトルラン（往復持久走）最大酸素摂取量推定表」（平成12年3月改訂）
 *       表の推移を一次近似した式: VO2max = 0.225 × 折り返し数 + 26.022
 */
function shuttleLapsVo2max(laps) {
  assertPositive(laps, '折り返し回数');
  return 0.225 * laps + 26.022;
}

/**
 * 6-b) Léger 20mシャトルラン（年齢補正式）
 * 到達速度 → VO2max
 * 出典: Léger LA, et al. / Ahmaidi 1992
 *       VO2max = 31.025 + 3.238×速度 − 3.248×年齢 + 0.1536×速度×年齢
 *       速度: km/h、年齢: 歳
 * ※ 元の検証対象は 8〜19歳。成人では外挿となるため参考値。
 */
function shuttleSpeedVo2max(speedKmh, age) {
  assertPositive(speedKmh, '到達速度');
  assertPositive(age, '年齢');
  return 31.025 + 3.238 * speedKmh - 3.248 * age + 0.1536 * speedKmh * age;
}

/* ============ 7) レース記録 → VO2max / VO2max → 予測タイム ================
 * Daniels–Gilbert の2式（Jack Daniels "Oxygen Power" / Running Formula）
 *   走行速度→酸素摂取量:  VO2 = −4.60 + 0.182258·v + 0.000104·v²   (v: m/min)
 *   持続時間→%VO2max   :  %max = 0.8 + 0.1894393·e^(−0.012778·t)
 *                              + 0.2989558·e^(−0.1932605·t)        (t: 分)
 *   VDOT = VO2 / %max
 * 検証: 5000m 20:00 → VDOT ≈ 49.8（公表値と一致）
 * ======================================================================== */
var DG_INTERCEPT = -4.60;
var DG_V = 0.182258;
var DG_V2 = 0.000104;

/** 走行速度(m/min) → 酸素摂取量(ml/kg/min) */
function dgVelocityVo2(velocityMpm) {
  assertPositive(velocityMpm, '速度');
  return DG_INTERCEPT + DG_V * velocityMpm + DG_V2 * velocityMpm * velocityMpm;
}

/** 持続時間(分) → 持続可能な%VO2max（0〜1） */
function dgPercentMax(minutes) {
  assertPositive(minutes, '時間');
  return 0.8
    + 0.1894393 * Math.exp(-0.012778 * minutes)
    + 0.2989558 * Math.exp(-0.1932605 * minutes);
}

/** レース記録（距離m・時間min）→ VO2max */
function raceVo2max(distanceMeters, timeMinutes) {
  assertPositive(distanceMeters, '距離');
  assertPositive(timeMinutes, '時間');
  var velocity = distanceMeters / timeMinutes;
  var vo2 = dgVelocityVo2(velocity);
  var pct = dgPercentMax(timeMinutes);
  if (vo2 <= 0 || pct <= 0) {
    throw new RangeError('この記録では推定値を算出できません。距離と時間を確認してください。');
  }
  return vo2 / pct;
}

/**
 * VO2max（と距離）→ 予測タイム（分）
 * raceVo2max(d, t) は t に対して単調減少なので二分法で解く。
 * 解が現実的な範囲に無い場合は null。
 */
function predictRaceTime(distanceMeters, vo2max) {
  assertPositive(distanceMeters, '距離');
  assertPositive(vo2max, 'VO2max');

  // raceVo2max は時間に対して単調減少。VO2が非正となる領域は -Infinity として
  // 扱い、現実的な上限（3000分）までに解が存在する場合のみ二分法で求める。
  function raceVo2Safe(minutes) {
    var velocity = distanceMeters / minutes;
    var vo2 = DG_INTERCEPT + DG_V * velocity + DG_V2 * velocity * velocity;
    if (vo2 <= 0) return -Infinity;
    return vo2 / dgPercentMax(minutes);
  }

  var lo = 0.05;   // 分
  var hi = 0.5;    // 分
  while (hi <= 3000 && raceVo2Safe(hi) > vo2max) {
    hi *= 1.5;
  }
  if (raceVo2Safe(hi) > vo2max) return null;   // 解なし（到達不能）
  if (raceVo2Safe(lo) < vo2max) return null;   // 速すぎて算出不能

  for (var i = 0; i < 200; i++) {
    var mid = (lo + hi) / 2;
    if (raceVo2Safe(mid) > vo2max) { lo = mid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

/** 予測対象の距離（1500m 〜 フルマラソン） */
var RACE_DISTANCES = [
  { key: '1500', label: '1,500 m', meters: 1500 },
  { key: '3000', label: '3,000 m', meters: 3000 },
  { key: '5000', label: '5,000 m', meters: 5000 },
  { key: '10000', label: '10,000 m', meters: 10000 },
  { key: 'half', label: 'ハーフマラソン', meters: 21097.5 },
  { key: 'full', label: 'フルマラソン', meters: 42195 }
];

/** VO2max → 主要距離の予測タイム */
function predictRaceTimes(vo2max) {
  assertPositive(vo2max, 'VO2max');
  return RACE_DISTANCES.map(function (d) {
    return {
      key: d.key,
      label: d.label,
      meters: d.meters,
      minutes: predictRaceTime(d.meters, vo2max)
    };
  });
}

/* ============================ 体力カテゴリ判定 ============================= */

/**
 * VO2max値による体力カテゴリ（成人・18歳以上）
 * 出典: Topend Sports "VO2max Norms"（ml/kg/min）
 * https://www.topendsports.com/testing/norms/vo2max.htm
 * thresholds は各カテゴリの下限値（優れている→非常に劣る の順）。
 */
var VO2MAX_NORMS = {
  male: [
    { maxAge: 25, thresholds: [60, 52, 47, 42, 37, 30] },
    { maxAge: 35, thresholds: [56, 49, 43, 40, 35, 30] },
    { maxAge: 45, thresholds: [51, 43, 39, 35, 31, 26] },
    { maxAge: 55, thresholds: [45, 39, 36, 32, 29, 25] },
    { maxAge: 65, thresholds: [41, 36, 32, 30, 26, 22] },
    { maxAge: 200, thresholds: [37, 33, 29, 26, 22, 20] }
  ],
  female: [
    { maxAge: 25, thresholds: [56, 47, 42, 38, 33, 28] },
    { maxAge: 35, thresholds: [52, 45, 39, 35, 31, 26] },
    { maxAge: 45, thresholds: [45, 38, 34, 31, 27, 22] },
    { maxAge: 55, thresholds: [40, 34, 31, 28, 25, 20] },
    { maxAge: 65, thresholds: [37, 32, 28, 25, 22, 18] },
    { maxAge: 200, thresholds: [32, 28, 25, 22, 19, 17] }
  ]
};

var CATEGORY_LABELS = [
  '優れている', '良好', '平均以上', '平均', '平均以下', '劣る', '非常に劣る'
];

/**
 * VO2max値から体力カテゴリを返す。
 * 対象は成人（18歳以上）。18歳未満は18–25歳の基準を適用する。
 */
function vo2maxCategory(vo2max, age, sex) {
  assertPositive(vo2max, 'VO2max');
  if (typeof age !== 'number' || !isFinite(age) || age < 0) {
    throw new RangeError('年齢は0以上の数値で入力してください。');
  }
  var rows = VO2MAX_NORMS[sex] || VO2MAX_NORMS.male;
  var row = rows[rows.length - 1];
  for (var i = 0; i < rows.length; i++) {
    if (age <= rows[i].maxAge) { row = rows[i]; break; }
  }
  var t = row.thresholds;
  for (var j = 0; j < t.length; j++) {
    if (vo2max >= t[j]) return CATEGORY_LABELS[j];
  }
  return CATEGORY_LABELS[CATEGORY_LABELS.length - 1];
}

/* ------------------------- Node.js エクスポート --------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LB_PER_KG: LB_PER_KG,
    M_PER_MILE: M_PER_MILE,
    parseTimeToMinutes: parseTimeToMinutes,
    hmsToMinutes: hmsToMinutes,
    formatMinutesToTime: formatMinutesToTime,
    formatPace: formatPace,
    kmToMeters: kmToMeters,
    milesToMeters: milesToMeters,
    lbToKg: lbToKg,
    kgToLb: kgToLb,
    kmhToMpm: kmhToMpm,
    mphToMpm: mphToMpm,
    cooper12MinRun: cooper12MinRun,
    uthSorensen: uthSorensen,
    estimateHrMax: estimateHrMax,
    rockportWalk: rockportWalk,
    acsmRunning: acsmRunning,
    oneAndHalfMileRun: oneAndHalfMileRun,
    shuttleLapsVo2max: shuttleLapsVo2max,
    shuttleSpeedVo2max: shuttleSpeedVo2max,
    dgVelocityVo2: dgVelocityVo2,
    dgPercentMax: dgPercentMax,
    raceVo2max: raceVo2max,
    predictRaceTime: predictRaceTime,
    predictRaceTimes: predictRaceTimes,
    RACE_DISTANCES: RACE_DISTANCES,
    vo2maxCategory: vo2maxCategory
  };
}

/* ================================= UI ===================================== */
if (typeof document !== 'undefined') {
  (function () {
    var form = document.getElementById('calcForm');
    var resultEl = document.getElementById('result');
    var resultValue = document.getElementById('resultValue');
    var resultBar = document.getElementById('resultBar');
    var resultCategory = document.getElementById('resultCategory');
    var resultMethod = document.getElementById('resultMethod');
    var resultFormula = document.getElementById('resultFormula');
    var predictionEl = document.getElementById('prediction');
    var predictionGrid = document.getElementById('predictionGrid');
    var errorEl = document.getElementById('error');
    var shuttleHint = document.getElementById('shuttle-hint');
    var currentMethod = 'race';

    var METHOD_NAMES = {
      race: 'レース記録（Daniels–Gilbert式）',
      shuttle: '20mシャトルラン',
      cooper: 'Cooper 12分間走テスト',
      uth: 'Uth–Sørensen 心拍数比法',
      rockport: 'Rockport 1マイル歩行テスト',
      acsm: 'トレッドミル走行テスト（ACSM走行式）',
      mile15: '1.5マイル走テスト'
    };

    var METHOD_FORMULAS = {
      race: 'VO2 = −4.60 + 0.182258·v + 0.000104·v² ／ %max = 0.8 + 0.1894393e^(−0.012778t) + 0.2989558e^(−0.1932605t)',
      shuttle: 'VO2max = 0.225 × 折り返し数 + 26.022（文部科学省式）',
      cooper: 'VO2max = (距離[m] − 504.9) / 44.73',
      uth: 'VO2max = 15.3 × (HRmax / HRrest)',
      rockport: 'VO2max = 132.853 − 0.0769×体重[lb] − 0.3877×年齢 + 6.315×性別 − 3.2649×時間[min] − 0.1565×HR',
      acsm: 'VO2 = 0.2×速度[m/min] + 0.9×速度×傾斜 + 3.5',
      mile15: 'VO2max = 3.5 + 483 / 時間[min]'
    };

    var SHUTTLE_HINTS = {
      mext: '文部科学省「新体力テスト」の最大酸素摂取量推定表に対応する換算式です。折り返し回数をそのまま入力してください。',
      leger: 'Léger式（年齢補正）は到達速度と年齢から算出します。元の検証対象は8〜19歳のため、成人では参考値となります。「体力カテゴリ判定」の年齢を入力してください。'
    };

    function el(id) { return document.getElementById(id); }
    function val(id) { return el(id).value; }
    function num(id) {
      var raw = val(id);
      if (raw === '') return NaN;
      return Number(raw);
    }

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      resultEl.hidden = true;
    }

    function selectMethod(method) {
      currentMethod = method;
      var chips = document.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].setAttribute('aria-selected', String(chips[i].dataset.method === method));
      }
      var panels = document.querySelectorAll('[data-panel]');
      for (var j = 0; j < panels.length; j++) {
        panels[j].hidden = panels[j].dataset.panel !== method;
      }
      errorEl.hidden = true;
      resultEl.hidden = true;
    }

    function toggleShuttleInputs() {
      var mode = val('shuttle-formula');
      var blocks = document.querySelectorAll('[data-shuttle]');
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].hidden = blocks[i].dataset.shuttle !== mode;
      }
      shuttleHint.textContent = SHUTTLE_HINTS[mode] || '';
    }

    function compute() {
      switch (currentMethod) {
        case 'race': {
          var dist = Number(val('race-distance'));
          var t = hmsToMinutes(num('race-h'), num('race-m'), num('race-s'));
          if (isNaN(t)) throw new RangeError('レースの記録を入力してください。');
          return raceVo2max(dist, t);
        }
        case 'shuttle': {
          if (val('shuttle-formula') === 'mext') {
            var laps = num('shuttle-laps');
            if (isNaN(laps)) throw new RangeError('折り返しの総回数を入力してください。');
            return shuttleLapsVo2max(laps);
          }
          var speed = num('shuttle-speed');
          if (isNaN(speed)) throw new RangeError('最後に到達した速度を入力してください。');
          var ageForShuttle = num('common-age');
          if (isNaN(ageForShuttle)) throw new RangeError('Léger式では年齢の入力が必要です。');
          return shuttleSpeedVo2max(speed, ageForShuttle);
        }
        case 'cooper': {
          var d = num('cooper-distance');
          if (isNaN(d)) throw new RangeError('12分間で走った距離を入力してください。');
          var unit = val('cooper-unit');
          var meters = unit === 'km' ? kmToMeters(d)
                     : unit === 'mi' ? milesToMeters(d)
                     : d;
          return cooper12MinRun(meters);
        }
        case 'uth': {
          var hrMax = num('uth-hrmax');
          var hrRest = num('uth-hrrest');
          if (isNaN(hrMax)) throw new RangeError('最大心拍数を入力してください。');
          if (isNaN(hrRest)) throw new RangeError('安静時心拍数を入力してください。');
          return uthSorensen(hrMax, hrRest);
        }
        case 'rockport': {
          var w = num('rockport-weight');
          if (isNaN(w)) throw new RangeError('体重を入力してください。');
          var age = num('common-age');
          if (isNaN(age)) throw new RangeError('1マイル歩行テストでは年齢の入力が必須です。');
          var time = hmsToMinutes(0, num('rockport-m'), num('rockport-s'));
          if (isNaN(time)) throw new RangeError('1マイル歩行時間を入力してください。');
          var hr = num('rockport-hr');
          if (isNaN(hr)) throw new RangeError('終了直後の心拍数を入力してください。');
          return rockportWalk({
            weight: w,
            weightUnit: val('rockport-weight-unit'),
            age: age,
            sex: val('common-sex'),
            time: time,
            endHr: hr
          });
        }
        case 'acsm': {
          var acsmSpeed = num('acsm-speed');
          if (isNaN(acsmSpeed)) throw new RangeError('速度を入力してください。');
          var su = val('acsm-speed-unit');
          var mpm = su === 'kmh' ? kmhToMpm(acsmSpeed)
                  : su === 'mph' ? mphToMpm(acsmSpeed)
                  : acsmSpeed;
          var gradeRaw = num('acsm-grade');
          var grade = isNaN(gradeRaw) ? 0 : gradeRaw;
          if (grade < 0) throw new RangeError('傾斜は0以上で入力してください。');
          return acsmRunning(mpm, grade / 100);
        }
        case 'mile15': {
          var t15 = hmsToMinutes(0, num('mile15-m'), num('mile15-s'));
          if (isNaN(t15)) throw new RangeError('1.5マイルの走行タイムを入力してください。');
          return oneAndHalfMileRun(t15);
        }
        default:
          throw new Error('未対応の推定法です。');
      }
    }

    function renderPredictions(vo2max) {
      var rows = predictRaceTimes(vo2max);
      predictionGrid.innerHTML = '';
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var card = document.createElement('div');
        card.className = 'pcard';

        var dist = document.createElement('span');
        dist.className = 'pcard__dist';
        dist.textContent = r.label;

        var time = document.createElement('span');
        time.className = 'pcard__time';
        time.textContent = r.minutes == null ? '—' : formatMinutesToTime(r.minutes);

        var pace = document.createElement('span');
        pace.className = 'pcard__pace';
        pace.textContent = r.minutes == null ? '—' : formatPace(r.minutes, r.meters);

        card.appendChild(dist);
        card.appendChild(time);
        card.appendChild(pace);
        predictionGrid.appendChild(card);
      }
      predictionEl.hidden = false;
    }

    function onSubmit(event) {
      event.preventDefault();
      try {
        var vo2max = compute();
        if (!isFinite(vo2max) || vo2max <= 0) {
          throw new RangeError('この入力では有効な推定値を算出できませんでした。値を確認してください。');
        }

        resultValue.textContent = vo2max.toFixed(1);
        resultMethod.textContent = METHOD_NAMES[currentMethod];
        resultFormula.textContent = METHOD_FORMULAS[currentMethod];

        var age = num('common-age');
        if (!isNaN(age) && age >= 10 && age <= 100) {
          resultCategory.textContent = vo2maxCategory(vo2max, age, val('common-sex'));
          resultCategory.hidden = false;
        } else {
          resultCategory.hidden = true;
        }

        resultBar.style.width = Math.max(4, Math.min(100, (vo2max / 70) * 100)) + '%';

        renderPredictions(vo2max);

        errorEl.hidden = true;
        resultEl.hidden = false;
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        predictionEl.hidden = true;
        showError(err.message);
      }
    }

    function onReset() {
      form.reset();
      errorEl.hidden = true;
      resultEl.hidden = true;
      predictionEl.hidden = true;
      toggleShuttleInputs();
      selectMethod('race');
    }

    var chips = document.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      (function (chip) {
        chip.addEventListener('click', function () { selectMethod(chip.dataset.method); });
      })(chips[i]);
    }

    el('shuttle-formula').addEventListener('change', toggleShuttleInputs);
    form.addEventListener('submit', onSubmit);
    el('resetBtn').addEventListener('click', onReset);

    toggleShuttleInputs();
    selectMethod('race');
  })();
}
