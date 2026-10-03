# MISSION — GIALAI EcoChain: FULL UI/UX + FUNCTIONAL BUG FIX PASS (bản rút gọn)

Bạn đang tiếp quản **GIALAI EcoChain** — hệ thống giám sát cháy rừng. Đây là **fix + nâng cấp sản phẩm hiện có**, KHÔNG phải rebuild. Mục tiêu: *same product, significantly better* — ổn định, thực tế, thông minh, dễ dùng, liên kết hơn.

**Thứ tự ưu tiên:** correctness → state consistency → workflow → usability → responsive → visual polish.

| Mức | Nội dung |
|---|---|
| P0 | Lỗi chức năng/state sai, data corruption, AI claim sai, logic dự đoán sai, race condition, duplicate event, sai tọa độ/timestamp/severity/count |
| P1 | AI recommendation sai ngữ cảnh, stale data, thiếu error/empty state, filter/map/list lệch nhau, lỗi refresh/reconnect |
| P2 | UX, responsive, accessibility, interaction |
| P3 | Visual polish, animation, micro-interaction |

Không ưu tiên gradient/shadow/animation/border trước khi P0/P1 sạch.

---

## 1. Quy tắc bất biến (KHÔNG phá nền tảng)

**Tuyệt đối không:** rewrite/tạo project mới, đổi framework/router/state management/map engine/design system khi cái cũ vẫn dùng được; xóa page/feature/button/API/field chỉ vì "không cần"; đổi API contract, DB schema, field name, ID, routing (`/`, `/command`, `/events` phải tiếp tục chạy); tạo fake data/fake loading (`setTimeout`)/fake realtime/fake confidence để che lỗi; `|| 0` cho async data; try/catch rỗng; sửa test chỉ để pass; làm UI đẹp nhưng logic sai.

**Phân loại trước khi sửa:** KEEP (đang tốt) · FIX (sửa root cause) · IMPROVE (nâng UX/logic) · INTEGRATE (nối feature bị cô lập) · REFACTOR (có kiểm soát) · REPLACE (chỉ khi thực sự không đáp ứng được).

**Cách làm:** smallest safe change → giải quyết root cause → giữ compatibility. Sửa component hiện có (thêm loading/error/empty state) thay vì tạo `NewCard.tsx`. Cần normalize dữ liệu → dùng adapter/mapper (`Existing API → Adapter → Canonical model → Existing UI`). Với mỗi thay đổi tự hỏi: cái gì đang có / sai gì / sửa gì / giữ gì / vì sao / rủi ro regression. Nếu không cần đổi thì đừng đổi.

**Giữ:** identity GIALAI EcoChain (logo, màu chủ đạo, layout, sidebar/header concept, card system, map). **Được sửa:** spacing, typography, hierarchy, alignment, contrast, responsive, giảm noise, states, interaction, a11y.

**Giữ & nâng cấp từng phần hiện có:**
- **Demo data:** audit → clean → normalize → relate → validate (không xóa rồi random lại).
- **AI hiện có:** fix hallucination, tăng grounding/context, schema output tốt hơn; nếu chỉ là heuristic thì giữ và gắn rõ DEMO/HEURISTIC, thiết kế để sau thay model thật không phải viết lại UI.
- **Chatbot:** giữ UI/history/entry point; nâng backend context (App State → Context Builder → Chatbot → Grounded response → Actions).
- **Map:** giữ basemap/controls/layers; nâng clustering, selection, list sync, filter, performance, loading/error.
- **3D/What-if:** nối scenario input → simulation → risk logic → map → comparison, không tạo simulation độc lập.
- **Card đẹp+đúng → KEEP; thiếu loading/error → EXTEND; spacing sai → POLISH; UX sai → redesign component đó, không redesign cả app.**

---

## 2. Phạm vi audit

Ưu tiên `/` (Eco Map/Dashboard), `/command` (Chỉ huy), `/events` (Event Intelligence), sau đó các route dùng chung component/layout. Phải tìm **root cause ở component/state/data-flow**, không chỉ vá CSS.

---

## 3. P0 — State, dữ liệu, trạng thái hệ thống

### 3.1 Lỗi `/events`
UI đang đồng thời hiện: "Danh sách phát hiện: 0", "Đang tải dữ liệu FIRMS...", map "53 TÍN HIỆU CẦN XÁC MINH", nhiều marker, badge "NGOẠI TUYẾN" và system "LIVE" → state inconsistency. Thiết kế lại thành 6 trạng thái, list và map dùng **cùng một source/state**:

- **LOADING:** skeleton, không hiện "0".
- **SUCCESS:** số detection thực tế.
- **EMPTY:** "Không có tín hiệu trong khoảng thời gian đã chọn" (không dùng "Đang tải...").
- **ERROR:** lỗi rõ + nút "Thử lại".
- **OFFLINE/FALLBACK:** ghi rõ cache/demo/fallback + timestamp; không giả lập LIVE.
- **PARTIAL:** "Bản đồ đã tải — danh sách đang đồng bộ..." (không hiện "0").

**Quy tắc:** không render count = 0 chỉ vì chưa load (`data?.length || 0` là sai). loading → skeleton; loaded + [] → 0; error → error state. Tìm và sửa mọi pattern tương tự trong codebase.

### 3.2 System status ≠ Data source
Tách hai khái niệm, không để "LIVE + OFFLINE" cho cùng pipeline:
- **SYSTEM:** LIVE / DEGRADED / OFFLINE
- **DATA:** FIRMS LIVE / FIRMS CACHE / DEMO / FALLBACK
- Ví dụ: `● SYSTEM LIVE · Data: FIRMS CACHE · cập nhật 12 phút trước`.

### 3.3 Freshness & Demo mode
- Dữ liệu realtime phải có freshness ("Cập nhật 22:10", "8 phút trước", "Dữ liệu cũ · 8 phút"). Stale quá ngưỡng → không hiện "LIVE".
- Sản phẩm là DEMO nhưng UI đang giống production → ghi rõ `DEMO MODE`, "Dữ liệu mô phỏng", "FIRMS cache"; không để BGK/người dùng tưởng simulation là dữ liệu vận hành thật.

### 3.4 KPI & nhất quán số liệu
- Dashboard 139 FIRMS hotspots vs Events 53 signals có thể đều đúng, nhưng UI phải giải thích (label + tooltip: "139 = tổng hotspot trong vùng/thời gian chọn; 53 = tín hiệu trong workflow xác minh").
- Audit mọi KPI (FIRMS hotspots, active incidents, active alerts, wind, AI detection, signals cần xác minh): mỗi cái có **definition, source, timestamp, trạng thái dữ liệu**.
- Phân cấp visual: số chính lớn, label, dòng phụ ("139 điểm · cập nhật 22:10"). KPI = 0 là bình thường → empty state trung tính, không tô đỏ chỉ vì bằng 0.
- Filter đổi thì Map/List/KPI/Count/Detail cập nhật cùng một state; luôn hiển thị filter context ("53 tín hiệu · 30 ngày · Tất cả cấp"), không để List=12, Map=53, KPI=139 mà không rõ filter nào.

---

## 4. UX theo từng khu vực

**Event Intelligence workflow:** bỏ layout lãng phí; header (tiêu đề + "53 tín hiệu cần xác minh" + filter Tất cả/Cấp I/II/III+) → trái là Signal List (hotspot #, vị trí, thời gian, confidence, [Theo dõi]) → phải là Map. Liên kết hai chiều: click list → map flyTo + marker active + mở detail; click marker → highlight list item + scroll vào viewport.

**Map:** clustering khi zoom out (hiện số lượng), tách khi zoom in; phân biệt FIRMS hotspot / AI detection / verified incident / warning / critical bằng icon, shape, border, label, state (không chỉ màu); selected marker (scale, z-index, panel, animation nhẹ); hover tooltip (desktop) / tap (mobile); controls (zoom, locate, layer, fullscreen, legend) không đè panel.

**Sidebar:** sticky/fixed đúng, không double-scroll, scrollbar subtle, active state không quá nặng, icon cùng kích thước, label thẳng baseline, spacing nhất quán, keyboard nav, tooltip khi collapsed.

**Header:** giảm pill/badge (Gia Lai, TRỰC TIẾP, LIVE, DEMO, VI, notification, Trợ lý AI…). Layout: LEFT logo → Gia Lai → môi trường/status; CENTER search; RIGHT system status → last sync → ngôn ngữ → notification → AI → profile. Chỉ dùng pill cho status/filter/selectable.

**Search (global, thật sự hoạt động):** debounce, loading, dropdown, keyboard nav, clear, empty state, Esc đóng, Enter chọn, highlight match; kết quả chia nhóm Địa điểm (xã, thôn) / Sự cố (FIRMS hotspot, incident).

**Dashboard `/command`:** không có card trắng trống, section cao mà rỗng, button vô nghĩa, metric thiếu context. Empty state có nội dung ("Không có sự kiện mới… [Thay đổi bộ lọc]"); loading → skeleton; offline → nêu data source.

**Typography:** có scale rõ (Display, H1–H3, Body, Body small, Caption, Label, Overline); bớt uppercase/tracking rộng; không font-size tùy ý.

**Ngôn ngữ:** thống nhất tiếng Việt (AI RECOMMENDATION → ĐỀ XUẤT AI; ACTIVE INCIDENTS → SỰ CỐ ĐANG HOẠT ĐỘNG; ACTIVE ALERTS → CẢNH BÁO ĐANG HOẠT ĐỘNG; LIVE EVENT STREAM → DÒNG SỰ KIỆN TRỰC TIẾP; NO RECENT EVENTS → CHƯA CÓ SỰ KIỆN MỚI); giữ English chỉ cho thuật ngữ cần thiết (FIRMS, AI, LIVE, GPS); tách text ra constants/i18n.

**Responsive:** test 1440/1280/1024/768/430/390. Mobile không phải desktop thu nhỏ: sidebar → drawer; list/map → tabs hoặc bottom sheet; KPI → scroll ngang/grid; header compact.

**Loading & Error:** skeleton cho KPI/list/detail, loading overlay cho map, tránh layout shift; không spinner đơn độc cho vùng lớn; không hiện 0/No data/Empty khi đang loading. Mọi fetch có loading/success/empty/error/retry; không nuốt lỗi; console sạch (unhandled rejection, undefined property, map container error, key/React warning).

**Button:** mỗi button có hover/active/focus/disabled/loading; không button trang trí; chưa implement thì không giả vờ (THEO DÕI phải đổi state, MỞ PHÂN TÍCH AI phải mở đúng panel, QUẢN LÝ phải có đích).

**Accessibility:** semantic HTML, aria-label, keyboard, focus-visible, contrast, touch target ≥ 44×44px, dialog/tooltip/map controls, không dùng màu làm tín hiệu duy nhất.

**Design tokens:** colors, spacing, radius, shadow, border, typography, z-index, motion (`--radius-sm/md/lg`, `--space-*`, `--surface`, `--border`, `--text-primary/secondary`, `--success/warning/danger`…). Giữ chất eco/command center nhưng tránh quá nhiều xanh/pill/shadow/border/card chồng.

**Motion:** 150–200ms hover/state; 200–300ms panel/dropdown; 300–500ms map transition; không animation liên tục, không animate cả page khi đổi route.

**Performance:** audit re-render, marker rendering, array lớn, listener, timer, polling, ảnh, memoization; với MapLibre/Mapbox dùng source/layer/clustering thay vì hàng trăm React marker.

**Code quality:** TypeScript strict, không `any` vô nghĩa, không `console.log` production, không dead/duplicate code/constants, không magic numbers, không phá test hiện có.

---

## 5. AI / Prediction / Detection — Deep Logic Audit

**Phạm vi:** AI detection & vision, hotspot classification, fire-risk/fire-level prediction, recommendation, confidence, anomaly, weather/wind, incident correlation, prediction timeline, AI explanation. **AI phải đúng logic trước khi đúng UI; không kết luận mạnh hơn dữ liệu đầu vào.**

**Phân biệt khái niệm:** FIRMS hotspot ≠ cháy xác nhận; AI detection ≠ cháy xác nhận; prediction ≠ chắc chắn xảy ra; anomaly ≠ incident. Các trạng thái: SIGNAL → DETECTION → ASSESSMENT → INCIDENT → VERIFIED INCIDENT. Không tự động hotspot → ACTIVE FIRE hay score 0.8 → "CẤP IV" khi chưa có logic/xác minh.

**Confidence/score/probability:**
- Grep `confidence/score/probability/risk/severity/prediction/accuracy`; cấm `Math.random()` và hằng số (0.85, 0.9) trình bày như kết quả AI thật.
- Chưa có model thật → ghi "Điểm mô phỏng"/"AI mô phỏng"; không hiện "AI confidence: 94%" như đã validate.
- Phân biệt MODEL SCORE / CONFIDENCE / PROBABILITY (cần calibration) / RISK SCORE; heuristic thì gọi "Risk score", không gọi "Probability of fire".

**Data integrity:**
- **Leakage:** dự đoán tại T chỉ dùng dữ liệu ≤ T (không T+1); không trộn forecast với actual weather; label/status tương lai không lọt vào feature; train/test không chứa cùng một event.
- **Temporal split:** train < validation < test theo thời gian; không có dataset thật → không giả vờ có accuracy.
- **Spatial leakage:** hotspot cùng một fire event không xuất hiện ở cả train và test (group theo event/spatial holdout).
- **Missing data:** `0 ≠ missing ≠ unknown ≠ stale` (wind = 0 km/h khác "không có dữ liệu gió"); không `undefined → 0` hay `null → risk cao` vô lý.
- **Stale data:** mỗi prediction biết freshness của input; quá cũ → "Prediction degraded / Dữ liệu cũ / Không thể đánh giá tin cậy", không "LIVE PREDICTION".
- **Tọa độ:** lat ∈ [-90, 90], lng ∈ [-180, 180]; bắt NaN/undefined/swap lat-lng/(0,0) fallback/sai CRS; điểm ngoài Gia Lai → đánh dấu anomaly; không âm thầm sửa tọa độ.
- **Khoảng cách:** dùng Haversine/geospatial lib, không `Math.abs(lat1-lat2)`; không trộn m/km/degrees.
- **Duplicate & correlation:** tách raw detections vs grouped events (139 detections → 53 signals → X events → Y verified incidents); không đếm 5 hotspot cùng sự kiện thành 5 incident; không group chỉ vì gần nhau khi lệch thời gian xa hoặc cùng xã; không duplicate do polling/refresh/route/realtime.

**Logic nghiệp vụ:**
- **Cấp cháy I–V:** định nghĩa rule rõ (input: risk, weather, wind, vegetation, hotspot density, history, verified status → output: level), threshold có tài liệu; chỉ là demo thì ghi "Phân loại mô phỏng theo bộ quy tắc demo"; AI không tự nhận "cấp cháy chính thức".
- **Monotonicity & boundary:** test risk = 0, 0.01, 0.49, 0.50, 0.99, 1 (và mọi threshold thật): không NaN/undefined/level trống/crash, không gap hoặc overlap.
- **Guard output:** NaN, ±Infinity, null, xác suất âm hoặc > 1 (1.37 không được render 137%).
- **Weather/wind:** đúng đơn vị (°C/°F, km/h/m/s), timestamp, source; hướng gió map đúng N/NE/E/SE/S/SW/W/NW và xử lý wrap-around (359° ≈ 1°).

**Recommendation & explanation:**
- Recommendation phụ thuộc context (số signal, score, khoảng cách, freshness, thời tiết, gió, severity, verification state), không generic "Đã có điểm nóng — xác minh ngay"; không mạnh hơn evidence (low confidence → theo dõi; nhiều tín hiệu gần nhau → ưu tiên xác minh cụm; stale → cập nhật dữ liệu trước; verified → chuyển workflow sự cố).
- "AI phát hiện nguy cơ cao" phải có WHY (risk score + factors); nếu model không explain được → "Đánh giá tự động", không bịa lý do.

**Độ ổn định & vận hành:**
- Deterministic với cùng input (soi random, `Date.now()`, side effect khi render, stale closure); không để LOW → CRITICAL → LOW nhảy mỗi lần render.
- Race condition (weather/FIRMS/AI/map/selection): dùng AbortController/request ID/version check; request cũ không overwrite request mới.
- Cache có createdAt/updatedAt/expiresAt/source; không LIVE khi đang hiển thị cache cũ; refresh không duplicate/reset về 0/nhấp nháy.
- AI loading: "AI đang phân tích..."/skeleton, không hiện Risk: 0. AI lỗi: "AI unavailable / Không thể đánh giá AI" (không fallback thành risk = 0); heuristic fallback phải ghi "Heuristic assessment".
- Metadata: model/rule version, data version, analysis timestamp (chưa có model → "Demo heuristic v1", không giả version). Audit trail: input timestamp, analysis timestamp, version, result, score hợp lệ, data sources, fallback status.
- Evaluation (nếu có model thật): precision, recall, F1, PR/ROC-AUC, confusion matrix, calibration, FP/FN riêng; kiểm tra class imbalance; chưa benchmark → "Chưa có benchmark", không bịa accuracy.
- Honesty wording: không "AI xác nhận cháy", "Chắc chắn cháy", "Cháy sẽ xảy ra", "AI dự đoán chính xác"; ưu tiên "Phát hiện tín hiệu", "Đánh giá rủi ro", "Tín hiệu chưa được xác minh", "Đánh giá tự động", "Không đủ dữ liệu".
- **Không giấu uncertainty:** **NO DATA / LOW RISK / UNKNOWN / AI UNAVAILABLE / STALE** là 5 UI state khác nhau ("Chưa đủ dữ liệu" ≠ "Nguy cơ thấp").
- Demo AI: tách rõ DEMO ENGINE → synthetic data → rule-based assessment; không gọi "Production AI", không fake accuracy/confidence/history/training data/version; gắn nhãn DEMO.
- Prediction card: Result (High/Moderate/Low/Insufficient data), score chỉ khi có nghĩa, Updated, Data quality (Good/Degraded/Stale), Why — không nhồi vào một con số lớn. Mọi prediction truy được nguồn (FIRMS, Weather, Wind, Historical + thời điểm; "Source unavailable" nếu thiếu).
- Map/List/Detail/AI panel dùng cùng **stable ID** (không dùng `items[3]`).
- AI error boundary riêng: AI crash không làm sập dashboard ("Không thể tải phân tích AI" + [Thử lại]).
- Logging: dev log input/rule/output/latency/fallback/error; production không log dữ liệu nhạy cảm/payload lớn/spam console.

**Test matrix AI tối thiểu:** valid/empty/null input; thiếu weather; thiếu/stale FIRMS; tọa độ sai; duplicate detection/incident; NaN, score < 0, score > 1; threshold boundary; concurrent & out-of-order requests; model unavailable; fallback; chưa/đã verified; refresh; route navigation; offline/reconnect; DEMO/LIVE mode. Cần fixture deterministic (cùng data + timestamp + version → cùng kết quả; simulation cần random thì seed).

**Các case bắt buộc:** (A) có FIRMS nhưng chưa verify → không thành confirmed fire; (B) không có FIRMS nhưng có verified incident → không kết luận "không có cháy"; (C) thiếu weather → prediction degraded/uncertain; (D) FIRMS stale → không LIVE; (E) hotspot trùng → không double-count.

---

## 6. Deep bug hunt (lỗi không thấy trên UI)

Static + runtime audit toàn project: race condition, stale state/closure, memory/listener/timer/polling/websocket/subscription leak, duplicate fetch/API call, infinite render/effect, thiếu dependency `useEffect`, thiếu hoặc dùng index làm React key, controlled/uncontrolled warning, hydration mismatch, map init nhiều lần/không cleanup, fetch không abort, request cũ cập nhật state sau khi đổi route, state reset sai khi refresh, localStorage corrupt, `JSON.parse` không guard, bug timezone/date parsing/number format/unit conversion, NaN/division by zero/empty array/undefined/null, duplicate ID/marker/event, lỗi pagination/infinite scroll, lệch filter/sort/search/map-list selection, debounce cleanup.

**Thời gian:** không trộn UTC / Asia/Ho_Chi_Minh / local; parse timestamp có timezone (không `new Date("2026-10-02 22:10:00")` nếu không ISO); định dạng thống nhất toàn app (vd `02/10/2026 22:10`).

**Refresh/Reconnect test:** mở dashboard → refresh → sang /events → refresh → mất mạng → có mạng lại → đổi filter khi đang loading → click marker khi đang loading → đổi route khi AI đang phân tích → quay lại. Không duplicate request/marker, không reset sai, không crash, không loading vô hạn, không result cũ đè mới.

---

## 7. Real-world readiness — hệ thống phải có logic thật, không "fake realism"

Mọi chức năng phải có **INPUT → PROCESSING → RESULT → CONTEXT → ACTION → FEEDBACK**; người dùng phải hiểu: dữ liệu từ đâu, ý nghĩa gì, xử lý thế nào, độ tin cậy, ảnh hưởng chức năng nào khác, làm gì tiếp, và hệ thống cập nhật gì sau đó. Không tạo UI chỉ để "trông thông minh".

**Số liệu:** mỗi metric trả lời được SOURCE, TIME, UNIT, SCOPE, DEFINITION, FRESHNESS; DEMO thì ghi `DEMO / SIMULATED`. Không hardcode 139/53/3.3 km/h/87%… ở nhiều nơi; phải đi qua pipeline `rawDetections → filter → deduplicate → classify → aggregate → derive KPIs` (raw đổi → KPI đổi theo).

**Domain model & ID:** một canonical domain model (Detection, Signal, Incident, Alert, Assessment, Prediction, Asset, ResponseTask); Map/List/Dashboard/Command/Events/AI/Chatbot cùng đọc một state, không mỗi nơi một bộ mock. Entity có stable ID (`signalId`, `incidentId`, `alertId`, `assetId`, `predictionId`, `taskId`) xuyên suốt Map → List → Detail → AI → Recommendation → Command → Chatbot → Audit trail.

**Adapter:** `External Source → Adapter → Normalizer → Domain Model → App State → UI/AI/Chatbot` (FIRMS/Weather/Map/AI adapter); UI không gọi API trực tiếp khắp nơi; demo và real dùng cùng schema.

**Lifecycle sự kiện:** RAW → INGESTED → NORMALIZED → VALIDATED → CORRELATED → ASSESSED → NEEDS VERIFICATION → VERIFIED/DISMISSED → INCIDENT → RESPONSE → RESOLVED → ARCHIVED. Không nhảy FIRMS → INCIDENT; chưa có xác minh thực địa thì mô phỏng và ghi `SIMULATED WORKFLOW`. Signal ≠ Alert ≠ Incident.

**Incident:** có ID, location, detected at, last updated, source, status, severity, risk, evidence, related signals/alerts, assigned unit, actions, timeline. Action thật: Verify → đổi status; Assign → tạo task/nhân sự; Track → theo dõi; Resolve → cập nhật lifecycle và count. Không button giả.

**Alert:** phải có trigger, threshold/rule, source, severity, timestamp, target entity, status, acknowledgement, resolution (vd "3 tín hiệu FIRMS tương quan trong 2 km / 30 phút"). Không có rule thật → không tạo alert; không alert chỉ vì `risk > 0.5`.

**Timeline & Audit:** timeline sinh từ state transition thật (không hardcode); audit event cho tạo/acknowledge alert, đổi status/assignment, hoàn tất verification, AI assessment, chạy scenario (actor, timestamp, action, entity, previous/new state). Notification từ event thật, không duplicate khi refresh; phân biệt new/read/acknowledged/resolved. Data provenance (source, timestamp, processing step, status) tồn tại trong metadata/debug.

**Action → consequence:** [Theo dõi] → cập nhật watchlist; [Xác minh] → tạo task, đổi status, cập nhật timeline; [Acknowledge] → đổi alert status, Command cập nhật; [Resolve] → giảm active incident count; [Mở AI analysis] → đúng entity. Không button chỉ đổi màu hoặc mở modal trống.

**Chatbot — trợ lý nghiệp vụ, grounded vào app state:**
- Trả lời được: số tín hiệu cần xác minh, tín hiệu đáng chú ý và lý do ưu tiên, incident đang xử lý/chưa xử lý, khu vực nhiều tín hiệu, hướng gió, thời điểm cập nhật/stale, alert chưa acknowledge, tài sản/đơn vị được phân công, diễn biến 30 phút/24 giờ, vì sao AI đánh giá như vậy, ảnh hưởng nếu gió đổi, đang DEMO hay LIVE, nguồn dữ liệu.
- Query domain state/data service trước khi trả lời (áp dụng filter/time range hiện tại), kèm source + timestamp; **LLM chỉ để hiểu câu hỏi/tổng hợp/giải thích; business engine mới tính toán/lọc/ranking/validate/chuyển trạng thái** (LLM không tự quyết "cấp IV" hay "cần điều xe").
- Không bịa số liệu: thiếu dữ liệu → "Hiện tôi không có dữ liệu đủ mới để xác định"; stale → "Dữ liệu gần nhất cập nhật X phút trước"; demo → "Đây là dữ liệu mô phỏng". Biết LIVE/DEMO/OFFLINE (FIRMS offline thì không nói "có 53 hotspot mới").
- Trả lời có cấu trúc (trạng thái, vị trí, tín hiệu, thời điểm, đánh giá, lý do, đề xuất, nguồn, cập nhật + [Mở trên bản đồ] [Xem sự kiện]); có action intents (OPEN_SIGNAL, OPEN_INCIDENT, SHOW_ON_MAP, FILTER_EVENTS, OPEN_ANALYSIS, OPEN_WHAT_IF, VIEW_ALERT, VIEW_ASSET, CREATE_VERIFICATION_TASK); chia sẻ context với Map (`selectedSignalId`), Event Intelligence (hiểu filter đang áp dụng), Command Center (task/alert/asset).

**AI orchestration & output:** `User/Event → Context Builder → Domain Services (Signal, Incident, Weather, Risk Engine, Alert Engine, Asset, Simulation) → AI/LLM → Structured result → Action/UI`. Context object đầy đủ (signalId, coordinates, detectedAt, source, nearbySignals, weather, wind, humidity, vegetation, historicalEvents, currentIncidents, alerts, dataFreshness, verificationStatus), không prompt trống. Output dạng schema `{summary, assessment, confidence, evidence[], dataSources[], limitations[], recommendations[], relatedEntityIds[], actions[]}`, UI render schema, không parse text tự do. Suy luận: Evidence → Interpretation → Uncertainty → Suggested next step; không kết luận "chắc chắn cháy".

**Tích hợp chéo:**
- **What-if Lab:** baseline → đổi biến (gió, nhiệt độ, độ ẩm, độ khô, số signal) → chạy **cùng risk engine thật** → so sánh baseline vs scenario (vd 0.48 → 0.61, +0.13) → giải thích + uncertainty; không hardcode "gió tăng → +20%". Map có scenario layer nếu model hỗ trợ; không thì "Scenario visualization unavailable with current model", không fake heatmap.
- **3D Fire Simulation:** không phải animation trang trí; input (gió, địa hình, nhiên liệu, độ ẩm, điểm cháy, tham số) → output (lan truyền, vùng ảnh hưởng, hướng, thời gian); ghi rõ `SIMULATION` (không gọi là "Prediction"), nêu assumptions. Chuỗi What-if → Simulation → AI/risk → Map → Comparison.
- **Weather** dùng xuyên feature (map, assessment, what-if, chatbot, command); **historical data** có mục đích (baseline, anomaly, xu hướng; không suy nhân quả — nói "khu vực này từng ghi nhận X tín hiệu", không nói "chắc chắn sẽ cháy"); **Asset** liên kết incident/task (Incident → Need verification → Available asset → Assignment → Task → Status → Timeline).
- **Command Center** trả lời nhanh: WHAT / WHERE / WHEN / HOW SERIOUS / WHY / WHAT NEXT / STATUS / SOURCE / DATA QUALITY — không chỉ là KPI dashboard.
- **Map = spatial source of truth:** mọi entity có vị trí đều mở/highlight/filter/xem detail được từ map; deep link Signal ↔ Event ↔ Incident ↔ AI ↔ Map ↔ Alert ↔ Task ↔ Asset; detail có related signals/incidents/alerts, AI assessment, weather, timeline, actions.
- **Không feature cô lập:** với mỗi menu (Eco Map, Chỉ huy, Event Intelligence, What-if Lab, Mô phỏng 3D, AI Assistant, Asset, Alerts, Incidents) trả lời: input từ đâu, output đi đâu, ảnh hưởng feature nào; nếu "không" → tích hợp hoặc loại UI thừa (có báo cáo). Mỗi chức năng phải qua "Practicality test": người dùng thật dùng nó để làm gì? **Ít chức năng nhưng liên kết chặt hơn nhiều card không tương tác.**

**Demo data:** một DEMO DATASET duy nhất, nhất quán (timestamps, tọa độ, quan hệ, trạng thái, weather, signals, incidents, alerts, assets, tasks); `DEMO SIGNAL-001` xuất hiện nhất quán ở Map/Events/AI/Chatbot/Command/Timeline. Có validation (tọa độ trong vùng, timestamp, severity, status transition hợp lệ, incident có signal/source, alert có trigger, task có target, asset không conflict, wind/weather hợp lý, risk trong range); dataset sai → fail validation, không để UI nuốt lỗi.

**Không che bug bằng UI:** API trả null → không thành 0; AI timeout → không thành Low Risk; FIRMS không tải được → không dùng data cũ gắn LIVE; prediction undefined → không random score; thiếu coordinate → không đặt marker (0,0); không có model → không fake confidence. Truy root cause; nếu không sửa được upstream thì hiển thị degraded/error minh bạch.

**Nguyên tắc xuyên suốt:** "Không biết" = "Không biết"; "Chưa tải" = "Đang tải"; "Không có dữ liệu" = "Không có dữ liệu"; "Dữ liệu cũ" = "Dữ liệu cũ"; "AI lỗi" = "AI lỗi"; "Chưa xác minh" = "Chưa xác minh". Không biến tất cả thành 0 / LOW / SAFE / NO INCIDENT / SUCCESS. *Absence of evidence ≠ evidence of absence.*

**Phân loại minh bạch toàn hệ thống:** REAL · DEMO · HEURISTIC · AI MODEL · SIMULATION · FALLBACK · CHƯA IMPLEMENTED. Không dùng chữ "AI" che tất cả, "LIVE" che mock, "PREDICTION" che simulation, "VERIFIED" khi chưa verify.

**6 user journey phải test:** (A) FIRMS → signal → map → AI → alert → verification → incident; (B) Command: alert → incident → map → AI → weather → assign task → timeline; (C) Chatbot: "Có gì đáng chú ý?" → query state → nguồn → click entity → map mở; (D) What-if: signal → đổi gió → simulation → risk recalculation → map comparison → AI explanation; (E) Dữ liệu lỗi: FIRMS unavailable → degraded → AI không fake → chatbot biết → retry/reconnect; (F) Xác minh: theo dõi → tạo task → hiện ở Command → status/timeline/signal cập nhật.

---

## 8. Cách thực hiện

Làm incremental, không "xóa cũ → sinh mới":

1. Backup/baseline hiện tại + **audit** architecture/data-flow/state (KEEP/FIX/IMPROVE/INTEGRATE/REFACTOR/REPLACE)
2. Fix P0 (state/logic/data)
3. Fix `/events` workflow
4. Fix dashboard/command
5. Fix Header + Sidebar dùng chung
6. Fix map interaction
7. Fix AI/prediction logic
8. Nối các feature hiện có (chatbot, what-if, simulation, asset, alert, incident)
9. Responsive → Accessibility → Visual polish
10. Regression test + build

Sau mỗi phase: kiểm TypeScript, runtime, không regression. Test cũ fail → tìm root cause, không sửa test cho pass.

**Lệnh kiểm tra:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (nếu khác thì đọc `package.json`). Thêm test cho loading/empty/success/error/offline/retry (đặc biệt *data chưa load ≠ empty data*), AI test matrix, race-condition, offline, refresh/reconnect.

---

## 9. Checklist nghiệm thu

**UI/state:** không loading giả · không count 0 khi đang loading · không LIVE + OFFLINE gây hiểu nhầm · list/map/marker đồng bộ · search hoạt động · sidebar không double-scroll · header gọn · KPI hierarchy rõ · empty/error state rõ · responsive · keyboard focus · không console error/React warning/layout shift lớn · không trộn Anh–Việt · không button giả · không dữ liệu giả mạo realtime.

**AI:** không fake confidence/probability/accuracy · không random prediction · hotspot ≠ confirmed fire · missing ≠ low risk · AI failure ≠ risk 0 · stale không gọi LIVE · không duplicate incident/counting · không lat/lng swap hoặc NaN/Infinity · threshold không gap/overlap · deterministic · không race/stale overwrite · không data/temporal/spatial leakage · không claim accuracy khi chưa benchmark · recommendation theo context · explanation không bịa · có source/timestamp/model-rule version · DEMO được ghi rõ · AI crash không sập app · AI có đủ state loading/success/empty/error/degraded · Map/List/Detail dùng cùng ID.

**Real-world:** số liệu có nguồn hoặc ghi DEMO · không hardcode KPI rải rác · có canonical domain data + stable IDs · Signal/Alert/Incident tách biệt · lifecycle hợp lý · chatbot grounded, biết freshness và LIVE/DEMO/OFFLINE, có deep link/action · What-if dùng chung risk engine · simulation dùng input thật · weather/historical/asset có mục đích · alert có trigger · incident có lifecycle · timeline từ state transition · audit trail có logic · refresh không duplicate · offline không fake success · demo data nhất quán · không feature cô lập · mọi button có consequence · workflow chính chạy xuyên suốt.

**Câu hỏi cuối trước khi báo PASS:** *"Nếu xóa toàn bộ screenshot và chỉ nhìn workflow/data-flow, hệ thống còn hợp lý như một hệ thống giám sát cháy rừng thực tế không?"* — nếu NO thì chưa PASS, tiếp tục sửa. Mục tiêu không phải "trông giống hệ thống thật" mà là "logic bên trong vận hành được như hệ thống thật trong phạm vi dữ liệu/model/nguồn lực project có". Không báo "done" nếu build/typecheck/runtime còn lỗi; không viết "AI hoạt động tốt" khi chưa benchmark (ghi: *"AI hiện tại là heuristic/demo engine, chưa phải model ML đã benchmark"*).

---

## 10. Báo cáo cuối (bắt buộc)

```
PASS — GIALAI EcoChain UI/UX + BUG FIX

PRESERVED:   các phần cũ giữ nguyên
FIXED:       P0 / P1 đã sửa (kèm Logic Bugs, Prediction Bugs, Data Integrity, Race Conditions, FP/FN risks)
UPGRADED:    UI/UX & data/state architecture đã nâng cấp
INTEGRATED:  các phần cũ được liên kết
REFACTORED:  các phần refactor
NOT CHANGED: phần cố ý không đổi vì đang đúng
REMOVED:     cái gì / lý do / tác động (không xóa → "Không xóa feature hiện có.")
Files/components đã sửa: ...

AI / Prediction:
- Engine hiện tại (production model / heuristic / demo):
- Input sources · Pipeline · Confidence semantics · Risk semantics
- Fallback · Model/rule version · Data freshness · Known limitations

Testing:
- Typecheck: PASS/FAIL   - Lint: PASS/FAIL
- Tests: X/X (AI unit, prediction edge cases, data validation, race-condition, offline, refresh/reconnect)
- Build: PASS/FAIL

Regression: Existing routes / tests / features / build — PASS/FAIL
Remaining: ...
```

---

## Golden rule

**GIỮ cái đang tốt. SỬA cái đang sai. NÂNG CẤP cái đang yếu. KẾT NỐI cái đang bị cô lập. KHÔNG rebuild khi không cần. KHÔNG xóa chỉ để viết lại. KHÔNG thêm feature chỉ để có thêm feature.**
