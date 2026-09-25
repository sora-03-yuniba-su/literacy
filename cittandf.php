<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#2563eb" />
<title>VO2max 計算・レースタイム予測</title>
<meta name="description" content="1500m〜フルマラソンのレース記録、20mシャトルラン、12分間走などから最大酸素摂取量（VO2max）を推定し、主要レースの予想タイムを計算するスマホ対応ツール。" />
<link rel="stylesheet" href="style.css" />
</head>
<body>
<div class="app">
  <header class="app__header">
    <p class="app__eyebrow">RUNNING &amp; FITNESS</p>
    <h1 class="app__title">VO<sub>2</sub>max 計算</h1>
    <p class="app__subtitle">レース記録やシャトルランから最大酸素摂取量を推定し、主要レースの予想タイムを算出します</p>
  </header>

  <nav class="chips" role="tablist" aria-label="推定方法の選択">
    <button class="chip" type="button" role="tab" aria-selected="true"  data-method="race">レース記録</button>
    <button class="chip" type="button" role="tab" aria-selected="false" data-method="shuttle">シャトルラン</button>
    <button class="chip" type="button" role="tab" aria-selected="false" data-method="cooper">12分間走</button>
    <button class="chip" type="button" role="tab" aria-selected="false" data-method="uth">心拍数比</button>
    <button class="chip" type="button" role="tab" aria-selected="false" data-method="rockport">1マイル歩行</button>
    <button class="chip" type="button" role="tab" aria-selected="false" data-method="acsm">トレッドミル</button>
    <button class="chip" type="button" role="tab" aria-selected="false" data-method="mile15">1.5マイル</button>
  </nav>

  <form id="calcForm" novalidate>

    <!-- レース記録 -->
    <section class="panel" data-panel="race">
      <h2 class="panel__title">レース記録から推定</h2>
      <div class="field">
        <label for="race-distance">距離</label>
        <select id="race-distance">
          <option value="1500">1,500 m</option>
          <option value="3000">3,000 m</option>
          <option value="5000" selected>5,000 m</option>
          <option value="10000">10,000 m</option>
          <option value="21097.5">ハーフマラソン（21.0975 km）</option>
          <option value="42195">フルマラソン（42.195 km）</option>
        </select>
      </div>
      <div class="field">
        <span class="field__label">記録（公式タイム）</span>
        <div class="timegrid">
          <label class="tcell"><input id="race-h" type="number" inputmode="numeric" min="0" max="23" placeholder="0" /><span>時間</span></label>
          <label class="tcell"><input id="race-m" type="number" inputmode="numeric" min="0" max="59" placeholder="0" /><span>分</span></label>
          <label class="tcell"><input id="race-s" type="number" inputmode="numeric" min="0" max="59" placeholder="0" /><span>秒</span></label>
        </div>
      </div>
      <p class="hint">レースで出した全力のタイムを入力してください。Daniels–Gilbert式でVO2maxと他距離の予想タイムを算出します。</p>
    </section>

    <!-- シャトルラン -->
    <section class="panel" data-panel="shuttle" hidden>
      <h2 class="panel__title">20mシャトルランから推定</h2>
      <div class="field">
        <label for="shuttle-formula">換算式</label>
        <select id="shuttle-formula">
          <option value="mext">文部科学省式（折り返し回数）</option>
          <option value="leger">Léger式（到達速度・年齢補正）</option>
        </select>
      </div>
      <div class="field" data-shuttle="mext">
        <label for="shuttle-laps">折り返しの総回数</label>
        <input id="shuttle-laps" type="number" inputmode="numeric" min="1" step="1" placeholder="60" />
      </div>
      <div class="field" data-shuttle="leger" hidden>
        <label for="shuttle-speed">最後に到達した速度（km/h）</label>
        <input id="shuttle-speed" type="number" inputmode="decimal" min="8" max="20" step="0.5" placeholder="12.5" />
      </div>
      <p class="hint" id="shuttle-hint">文部科学省「新体力テスト」の最大酸素摂取量推定表に対応する換算式です。折り返し回数をそのまま入力してください。</p>
    </section>

    <!-- 12分間走 -->
    <section class="panel" data-panel="cooper" hidden>
      <h2 class="panel__title">Cooper 12分間走テスト</h2>
      <div class="field">
        <label for="cooper-distance">12分間で走った距離</label>
        <div class="field__group">
          <input id="cooper-distance" type="number" inputmode="decimal" min="1" step="any" placeholder="2400" />
          <select id="cooper-unit" aria-label="距離の単位">
            <option value="m">メートル</option>
            <option value="km">キロメートル</option>
            <option value="mi">マイル</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 心拍数比 -->
    <section class="panel" data-panel="uth" hidden>
      <h2 class="panel__title">Uth–Sørensen 心拍数比法</h2>
      <div class="grid-2">
        <div class="field">
          <label for="uth-hrmax">最大心拍数（bpm）</label>
          <input id="uth-hrmax" type="number" inputmode="numeric" min="100" max="230" step="1" placeholder="190" />
        </div>
        <div class="field">
          <label for="uth-hrrest">安静時心拍数（bpm）</label>
          <input id="uth-hrrest" type="number" inputmode="numeric" min="30" max="120" step="1" placeholder="50" />
        </div>
      </div>
      <p class="hint">最大心拍数が不明な場合は「220 − 年齢」で代用できます。</p>
    </section>

    <!-- 1マイル歩行 -->
    <section class="panel" data-panel="rockport" hidden>
      <h2 class="panel__title">Rockport 1マイル歩行テスト</h2>
      <div class="field">
        <label for="rockport-weight">体重</label>
        <div class="field__group">
          <input id="rockport-weight" type="number" inputmode="decimal" min="20" step="0.1" placeholder="65" />
          <select id="rockport-weight-unit" aria-label="体重の単位">
            <option value="kg">キログラム</option>
            <option value="lb">ポンド</option>
          </select>
        </div>
      </div>
      <div class="field">
        <span class="field__label">1マイル歩行時間</span>
        <div class="timegrid timegrid--2">
          <label class="tcell"><input id="rockport-m" type="number" inputmode="numeric" min="0" max="59" placeholder="13" /><span>分</span></label>
          <label class="tcell"><input id="rockport-s" type="number" inputmode="numeric" min="0" max="59" placeholder="30" /><span>秒</span></label>
        </div>
      </div>
      <div class="field">
        <label for="rockport-hr">終了直後の心拍数（bpm）</label>
        <input id="rockport-hr" type="number" inputmode="numeric" min="60" max="220" step="1" placeholder="124" />
      </div>
      <p class="hint">年齢は下の「体力カテゴリ判定」欄の値を使用します。</p>
    </section>

    <!-- トレッドミル -->
    <section class="panel" data-panel="acsm" hidden>
      <h2 class="panel__title">トレッドミル走行テスト（ACSM走行式）</h2>
      <div class="grid-2">
        <div class="field">
          <label for="acsm-speed">最大努力時の速度</label>
          <div class="field__group">
            <input id="acsm-speed" type="number" inputmode="decimal" min="1" step="0.1" placeholder="12" />
            <select id="acsm-speed-unit" aria-label="速度の単位">
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
              <option value="mpm">m/min</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="acsm-grade">傾斜（%）</label>
          <input id="acsm-grade" type="number" inputmode="decimal" min="0" max="40" step="0.5" placeholder="5" />
        </div>
      </div>
      <p class="hint">全力で到達した時点の速度と傾斜を入力してください。</p>
    </section>

    <!-- 1.5マイル走 -->
    <section class="panel" data-panel="mile15" hidden>
      <h2 class="panel__title">1.5マイル走テスト</h2>
      <div class="field">
        <span class="field__label">1.5マイルの走行タイム</span>
        <div class="timegrid timegrid--2">
          <label class="tcell"><input id="mile15-m" type="number" inputmode="numeric" min="0" max="59" placeholder="12" /><span>分</span></label>
          <label class="tcell"><input id="mile15-s" type="number" inputmode="numeric" min="0" max="59" placeholder="0" /><span>秒</span></label>
        </div>
      </div>
    </section>

    <!-- カテゴリ判定 -->
    <section class="panel panel--common">
      <h2 class="panel__title">体力カテゴリ判定（任意）</h2>
      <div class="grid-2">
        <div class="field">
          <label for="common-age">年齢</label>
          <input id="common-age" type="number" inputmode="numeric" min="10" max="100" step="1" placeholder="30" />
        </div>
        <div class="field">
          <label for="common-sex">性別</label>
          <select id="common-sex">
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </div>
      </div>
      <p class="hint">成人（18歳以上）の基準でカテゴリを判定します。</p>
    </section>

    <div class="actions">
      <button class="btn btn--primary" type="submit" id="calcBtn">計算する</button>
      <button class="btn btn--ghost" type="button" id="resetBtn">リセット</button>
    </div>
    <p class="error" id="error" role="alert" hidden></p>
  </form>

  <section class="result" id="result" hidden aria-live="polite">
    <p class="result__label">推定 VO<sub>2</sub>max</p>
    <p class="result__value"><span id="resultValue">—</span><span class="result__unit">ml/kg/min</span></p>
    <p class="result__bar" aria-hidden="true"><span id="resultBar"></span></p>
    <p class="result__category" id="resultCategory" hidden></p>
    <p class="result__method" id="resultMethod"></p>
    <p class="result__formula" id="resultFormula"></p>

    <div class="prediction" id="prediction" hidden>
      <h3 class="prediction__title">このVO<sub>2</sub>maxから予測されるレースタイム</h3>
      <div class="prediction__grid" id="predictionGrid"></div>
      <p class="prediction__note">Daniels–Gilbert式による推定値です。フルマラソンは持久力の個人差が大きく、誤差が拡大しやすい距離です。</p>
    </div>
  </section>

  <footer class="app__footer">
    <p>推定式に基づく参考値です。医学的な診断には直接測定（呼気ガス分析）が必要です。</p>
  </footer>
</div>
<script src="app.js"></script>
</body>
</html>
