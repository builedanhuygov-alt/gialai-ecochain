Bạn đang tiếp quản dự án GIALAI EcoChain — hệ thống giám sát cháy rừng / EcoChain.

Mục tiêu của PASS này:

KHÔNG chỉ polish giao diện.

Hãy thực hiện một FULL UI/UX \+ FUNCTIONAL BUG FIX PASS cho toàn bộ các màn hình tôi cung cấp, ưu tiên sửa từ:

P0 — lỗi chức năng / trạng thái sai  
P1 — lỗi UX gây khó chịu hoặc gây hiểu nhầm  
P2 — lỗi layout / responsive / interaction  
P3 — visual polish / consistency  
P4 — micro-interactions / accessibility

TUYỆT ĐỐI KHÔNG phá backend, API contract, routing hoặc dữ liệu hiện có.

\--------------------------------------------------  
\#\# 1\. CÁC MÀN HÌNH CẦN AUDIT  
\--------------------------------------------------

Tập trung trước vào:

/                → Eco Map / Dashboard  
/command         → Chỉ huy  
/events          → Event Intelligence

Sau đó kiểm tra các route liên quan nếu chúng dùng chung component/layout.

Không được chỉ sửa CSS riêng lẻ.  
Phải tìm nguyên nhân gốc ở component/state/data-flow nếu UI đang hiển thị sai trạng thái.

\--------------------------------------------------  
\#\# 2\. P0 — FIX CÁC LỖI LOGIC / STATE NGAY  
\--------------------------------------------------

\#\#\# /events hiện đang có lỗi nghiêm trọng:

UI đang đồng thời thể hiện:

\- "Danh sách phát hiện: 0"  
\- "Đang tải dữ liệu FIRMS..."  
\- map lại hiển thị "53 TÍN HIỆU CẦN XÁC MINH"  
\- có rất nhiều hotspot marker  
\- badge "Dữ liệu: NGOẠI TUYẾN"  
\- phía trên lại có trạng thái hệ thống LIVE

Đây là state inconsistency.

Không được để các trạng thái này xuất hiện đồng thời nếu chúng không thực sự phản ánh cùng một data source.

Thiết kế lại data state thành rõ ràng:

LOADING  
EMPTY  
SUCCESS  
ERROR  
OFFLINE / FALLBACK  
PARTIAL

Ví dụ:

LOADING:  
\- skeleton/list loading  
\- không hiển thị "0" như thể không có dữ liệu

SUCCESS:  
\- hiển thị số detection thực tế  
\- list và map dùng cùng một source/state

EMPTY:  
\- "Không có tín hiệu trong khoảng thời gian đã chọn"  
\- không dùng "Đang tải..."

ERROR:  
\- hiển thị lỗi rõ ràng  
\- có nút "Thử lại"

OFFLINE/FALLBACK:  
\- ghi rõ dữ liệu đang dùng là dữ liệu cache/demo/fallback  
\- timestamp của dữ liệu  
\- không được đồng thời giả lập "LIVE" nếu thực tế không có live feed

PARTIAL:  
\- nếu map đã có data nhưng list chưa tải xong:  
  "Bản đồ đã tải — danh sách đang đồng bộ..."  
\- không hiển thị "0"

\#\#\# Quy tắc bắt buộc:

Không render count \= 0 chỉ vì data chưa load.

Sai:

const count \= data?.length || 0

Đúng về mặt UX:

loading → skeleton  
loaded \+ \[\] → 0  
error → error state

Tìm toàn bộ codebase những pattern tương tự và sửa.

\--------------------------------------------------  
\#\# 3\. LIVE / DEMO / OFFLINE STATE  
\--------------------------------------------------

Header hiện có:

TRỰC TIẾP  
LIVE  
DEMO

Trong khi Event Intelligence lại hiển thị:

"Dữ liệu: NGOẠI TUYẾN"

Phải xác định rõ semantics.

Không được có tình trạng:

LIVE \+ OFFLINE

nếu hai badge đang mô tả cùng một data pipeline.

Thiết kế status hierarchy:

SYSTEM STATUS  
\- LIVE  
\- DEGRADED  
\- OFFLINE

DATA SOURCE  
\- FIRMS LIVE  
\- FIRMS CACHE  
\- DEMO  
\- FALLBACK

Hai khái niệm này phải tách biệt.

Ví dụ hợp lệ:

● SYSTEM LIVE  
Data: FIRMS CACHE · cập nhật 12 phút trước

hoặc:

● SYSTEM DEGRADED  
Data: FIRMS FALLBACK

Không dùng badge gây hiểu nhầm.

\--------------------------------------------------  
\#\# 4\. P0 — DATA CONSISTENCY  
\--------------------------------------------------

Hiện screenshot cho thấy:

\- Dashboard: 139 FIRMS hotspots  
\- Event Intelligence: 53 signals cần xác minh

Không nhất thiết đây là bug vì hai metric có thể khác nhau.

Nhưng UI phải giải thích được sự khác biệt.

Ví dụ:

FIRMS HOTSPOTS  
139  
Tổng tín hiệu vệ tinh

UNVERIFIED SIGNALS  
53  
Tín hiệu cần xác minh thực địa

Hoặc tooltip:

"139 là tổng hotspot trong vùng/thời gian đang chọn.  
53 là số tín hiệu đang nằm trong workflow xác minh."

Không để người dùng tự đoán.

Audit tất cả KPI:

\- FIRMS hotspots  
\- Active incidents  
\- Active alerts  
\- Wind  
\- AI detection  
\- Signals requiring verification

Mỗi KPI phải có:  
\- definition  
\- source  
\- timestamp nếu cần  
\- trạng thái dữ liệu

\--------------------------------------------------  
\#\# 5\. EVENT INTELLIGENCE UX  
\--------------------------------------------------

Màn /events hiện tại có layout rất lãng phí:

Bên trái:  
"Thông tin sự kiện"

nhưng bên trong chỉ có:  
"Danh sách phát hiện 0"  
"Đang tải dữ liệu FIRMS..."

Trong khi map bên phải đã chứa toàn bộ thông tin.

Thiết kế lại thành workflow rõ ràng:

┌─────────────────────────────────────────────┐  
│ Event Intelligence                         │  
│ 53 tín hiệu cần xác minh                   │  
│ \[Tất cả\] \[Cấp I\] \[Cấp II\] \[Cấp III+\]      │  
├──────────────────┬──────────────────────────┤  
│ SIGNAL LIST      │ MAP                      │  
│                  │                          │  
│ hotspot \#...     │ markers                  │  
│ location         │                          │  
│ time             │                          │  
│ confidence       │                          │  
│ \[Theo dõi\]       │                          │  
│                  │                          │  
└──────────────────┴──────────────────────────┘

Danh sách và map phải liên kết:

click list item  
→ map flyTo marker  
→ marker active  
→ detail panel mở

click marker  
→ item tương ứng trong list active/highlight  
→ scroll item vào viewport nếu cần

Không tạo hai UI độc lập.

\--------------------------------------------------  
\#\# 6\. MAP UX  
\--------------------------------------------------

Map hiện quá nhiều marker nhưng chưa có hierarchy.

Phải xử lý:

\#\#\# Marker clustering

Khi zoom out:  
\- cluster markers  
\- hiển thị số lượng

Khi zoom in:  
\- tách marker

\#\#\# Marker hierarchy

Phân biệt rõ:

FIRMS hotspot  
AI detection  
verified incident  
warning  
critical

Không chỉ dựa vào màu.

Dùng:  
\- icon  
\- shape  
\- border  
\- label  
\- state

\#\#\# Selected marker

Khi click:  
\- marker scale/highlight  
\- z-index lên trên  
\- panel tương ứng  
\- map animation nhẹ

\#\#\# Hover

Desktop:  
\- tooltip ngắn

Mobile:  
\- tap

\#\#\# Map controls

Không để controls đè lên panel.

Kiểm tra:  
\- zoom  
\- locate  
\- layer  
\- fullscreen  
\- legend

\--------------------------------------------------  
\#\# 7\. SIDEBAR  
\--------------------------------------------------

Sidebar hiện có vấn đề:

\- scroll riêng  
\- nội dung cuối bị khuất  
\- active state hơi nặng  
\- navigation hierarchy chưa rõ  
\- icon/text spacing chưa đồng nhất

Audit toàn bộ sidebar.

Yêu cầu:

\- fixed/sticky đúng cách  
\- không double-scroll khó chịu  
\- active route rõ nhưng không quá nặng  
\- icon cùng kích thước  
\- label baseline thẳng hàng  
\- section spacing nhất quán  
\- keyboard navigation  
\- tooltip khi collapsed

Nếu sidebar scroll:  
\- scrollbar phải subtle  
\- không che content  
\- wheel behavior tự nhiên

\--------------------------------------------------  
\#\# 8\. HEADER  
\--------------------------------------------------

Header hiện quá nhiều pill/badge:

Gia Lai  
TRỰC TIẾP  
LIVE  
DEMO  
Hệ thống trực tiếp  
VI  
notification  
Trợ lý AI

Đang gây visual noise.

Thiết kế hierarchy:

LEFT:  
Logo → Gia Lai → environment/status

CENTER:  
Search

RIGHT:  
System status → last sync → language → notification → AI assistant → profile/action

Không lạm dụng pill.

Chỉ dùng pill cho:  
\- status  
\- filter  
\- selectable state

Không biến mọi text thành pill.

\--------------------------------------------------  
\#\# 9\. SEARCH  
\--------------------------------------------------

Search hiện:

"Tìm xã, thôn, sự cố..."

Phải hoạt động như global search.

Có:  
\- debounce  
\- loading state  
\- result dropdown  
\- keyboard navigation  
\- clear button  
\- empty state  
\- escape để đóng  
\- enter để chọn  
\- highlight match

Search result nên chia:

Địa điểm  
\- Xã...  
\- Thôn...

Sự cố  
\- FIRMS hotspot...  
\- Incident...

Không được chỉ là input trang trí.

\--------------------------------------------------  
\#\# 10\. DASHBOARD /COMMAND  
\--------------------------------------------------

Audit toàn bộ dashboard.

Không để:

\- card trắng trống  
\- "NO RECENT EVENTS" quá trống trải  
\- section quá cao nhưng không có content  
\- button không rõ tác dụng  
\- metric không có context

Ví dụ:

LIVE EVENT STREAM

Nếu không có event:

Không chỉ:

NO RECENT EVENTS

Mà:

Không có sự kiện mới  
Hệ thống chưa ghi nhận sự kiện trong khoảng thời gian này.

\[Thay đổi bộ lọc\]

Nếu đang loading:  
→ skeleton

Nếu offline:  
→ thông báo data source.

\--------------------------------------------------  
\#\# 11\. KPI CARDS  
\--------------------------------------------------

Các card:

FIRMS HOTSPOTS  
139

WIND  
3.3 km/h

ACTIVE INCIDENTS  
0

ACTIVE ALERTS  
0

Cần phân cấp visual.

Metric chính:  
139

Label:  
FIRMS HOTSPOTS

Secondary:  
139 điểm · cập nhật 22:10

Không để các card 0 trông giống như lỗi.

Nếu 0 là trạng thái bình thường:  
→ neutral empty state.

Nếu 0 là đáng chú ý:  
→ giải thích.

Không dùng màu đỏ chỉ vì giá trị \= 0\.

\--------------------------------------------------  
\#\# 12\. TYPOGRAPHY  
\--------------------------------------------------

Audit typography toàn bộ app.

Hiện tại có cảm giác:

\- nhiều uppercase  
\- tracking quá rộng  
\- title/card label chưa đồng nhất  
\- tiếng Việt và tiếng Anh trộn lẫn  
\- một số text giống placeholder hơn là production UI

Thiết lập typography scale rõ:

Display  
H1  
H2  
H3  
Body  
Body small  
Caption  
Label  
Overline

Không dùng font-size tùy ý từng component.

Các heading quan trọng không nên uppercase toàn bộ nếu không cần.

\--------------------------------------------------  
\#\# 13\. LANGUAGE CONSISTENCY  
\--------------------------------------------------

App đang trộn:

Vietnamese:  
"Thông tin sự kiện"  
"Đang tải dữ liệu FIRMS"

English:  
AI RECOMMENDATION  
ACTIVE INCIDENTS  
ACTIVE ALERTS  
LIVE EVENT STREAM  
NO RECENT EVENTS

Phải thống nhất.

Nếu sản phẩm target Việt Nam:  
ưu tiên tiếng Việt.

Ví dụ:

AI RECOMMENDATION  
→ ĐỀ XUẤT AI

ACTIVE INCIDENTS  
→ SỰ CỐ ĐANG HOẠT ĐỘNG

ACTIVE ALERTS  
→ CẢNH BÁO ĐANG HOẠT ĐỘNG

LIVE EVENT STREAM  
→ DÒNG SỰ KIỆN TRỰC TIẾP

NO RECENT EVENTS  
→ CHƯA CÓ SỰ KIỆN MỚI

Giữ English chỉ cho thuật ngữ kỹ thuật thực sự cần thiết:  
FIRMS  
AI  
LIVE  
GPS  
etc.

Tách text thành constants/i18n thay vì hardcode rải rác.

\--------------------------------------------------  
\#\# 14\. RESPONSIVE  
\--------------------------------------------------

Phải test ít nhất:

1440px  
1280px  
1024px  
768px  
430px  
390px

Đặc biệt:

\- map  
\- sidebar  
\- event list  
\- KPI cards  
\- header  
\- search  
\- AI assistant

Mobile không được chỉ là desktop thu nhỏ.

Mobile nên chuyển:

sidebar → drawer  
event list/map → tabs hoặc bottom sheet  
KPI → horizontal scroll/grid  
header → compact

\--------------------------------------------------  
\#\# 15\. LOADING UX  
\--------------------------------------------------

Không dùng spinner đơn độc cho các vùng lớn.

Tạo skeleton:

KPI skeleton  
event list skeleton  
map loading overlay  
detail panel skeleton

Tránh layout shift.

Không hiển thị:

0  
No data  
Empty

trong lúc loading.

\--------------------------------------------------  
\#\# 16\. ERROR UX  
\--------------------------------------------------

Mọi API/data fetch phải có:

loading  
success  
empty  
error  
retry

Không swallow error.

Không để console có:

Unhandled promise rejection  
Cannot read properties of undefined  
Map container errors  
key warnings  
React warnings

Fix toàn bộ.

\--------------------------------------------------  
\#\# 17\. BUTTON / INTERACTION AUDIT  
\--------------------------------------------------

Audit tất cả button.

Mỗi button phải có:

\- hover  
\- active  
\- focus  
\- disabled  
\- loading

Không có button chỉ để trang trí.

Nếu action chưa implement:  
→ không giả vờ là đã hoạt động.

Ví dụ:

"THEO DÕI"  
phải thực sự thay đổi state.

"MỞ PHÂN TÍCH AI"  
phải mở đúng panel/modal/page.

"QUẢN LÝ"  
phải có destination/action.

\--------------------------------------------------  
\#\# 18\. ACCESSIBILITY  
\--------------------------------------------------

Audit:

\- semantic HTML  
\- aria-label  
\- keyboard navigation  
\- focus-visible  
\- contrast  
\- button size  
\- map controls  
\- dialogs  
\- tooltips

Touch target tối thiểu khoảng 44x44px.

Không dùng màu là tín hiệu duy nhất.

\--------------------------------------------------  
\#\# 19\. VISUAL SYSTEM  
\--------------------------------------------------

Tạo design tokens:

colors  
spacing  
radius  
shadow  
border  
typography  
z-index  
motion

Không hardcode mỗi component một kiểu.

Ví dụ:

\--radius-sm  
\--radius-md  
\--radius-lg

\--space-1  
\--space-2  
...

\--surface  
\--surface-elevated  
\--border  
\--text-primary  
\--text-secondary  
\--success  
\--warning  
\--danger

Giữ visual identity:

Eco / environmental / command center

nhưng tránh:  
\- quá nhiều xanh  
\- quá nhiều pill  
\- quá nhiều shadow  
\- quá nhiều border  
\- card stacking quá dày

\--------------------------------------------------  
\#\# 20\. MOTION  
\--------------------------------------------------

Animation phải phục vụ UX.

Dùng:

150–200ms  
cho hover/state

200–300ms  
cho panel/dropdown

300–500ms  
cho map transition

Không animation liên tục gây mỏi mắt.

Không animate toàn bộ page khi route change.

\--------------------------------------------------  
\#\# 21\. DATA FRESHNESS  
\--------------------------------------------------

Các dữ liệu realtime phải hiển thị freshness.

Ví dụ:

Cập nhật 22:10:21  
vừa cập nhật

hoặc:

Cập nhật 8 phút trước

Nếu stale:

Dữ liệu cũ · 8 phút

Không hiển thị:

LIVE

nếu dữ liệu đã stale vượt threshold.

\--------------------------------------------------  
\#\# 22\. DEMO MODE  
\--------------------------------------------------

Đây là sản phẩm demo nhưng UI đang giống production/live system.

Phải làm rõ:

DEMO MODE

nhưng vẫn có thể mô phỏng:

\- FIRMS  
\- incident  
\- AI detection  
\- wind  
\- alerts

Nếu data là simulated:  
hiển thị nhỏ:

Dữ liệu mô phỏng

Nếu data lấy từ cache:  
hiển thị:

FIRMS cache

Không để BGK/người dùng hiểu nhầm simulation là real-time operational data.

\--------------------------------------------------  
\#\# 23\. PERFORMANCE  
\--------------------------------------------------

Audit:

\- unnecessary re-render  
\- map marker rendering  
\- large arrays  
\- event listeners  
\- timers  
\- polling  
\- image loading  
\- component memoization

Đặc biệt map:

Không render hàng trăm marker React DOM nếu có thể dùng layer/source phù hợp.

Nếu dùng MapLibre/Mapbox:  
ưu tiên source/layer/clustering thay vì hàng trăm React component.

\--------------------------------------------------  
\#\# 24\. CODE QUALITY  
\--------------------------------------------------

Sau khi sửa UI:

\- TypeScript strict  
\- không any vô nghĩa  
\- không console.log production  
\- không dead code  
\- không duplicate component  
\- không duplicate constants  
\- không magic numbers

Không phá tests hiện có.

\--------------------------------------------------  
\#\# 25\. TESTING  
\--------------------------------------------------

Sau khi hoàn thành:

npm run typecheck  
npm run lint  
npm test  
npm run build

Nếu project dùng command khác thì đọc package.json và dùng đúng script.

Không sửa test chỉ để làm test pass.

Nếu test fail:  
→ tìm root cause.

Thêm tests cho các state quan trọng:

loading  
empty  
success  
error  
offline  
retry

Đặc biệt:

data chưa load ≠ empty data

\--------------------------------------------------  
\#\# 26\. FINAL VISUAL QA  
\--------------------------------------------------

Sau khi code xong, tự kiểm tra từng route:

/  
/command  
/events

Kiểm tra:

\[ \] Không còn loading giả  
\[ \] Không còn count 0 khi đang loading  
\[ \] Không còn LIVE \+ OFFLINE gây hiểu nhầm  
\[ \] List/map đồng bộ  
\[ \] Marker ↔ list selection đồng bộ  
\[ \] Search hoạt động  
\[ \] Sidebar không gây double scroll  
\[ \] Header không quá dày  
\[ \] KPI hierarchy rõ  
\[ \] Empty state rõ  
\[ \] Error state rõ  
\[ \] Responsive  
\[ \] Keyboard focus  
\[ \] Không console error  
\[ \] Không React warning  
\[ \] Không layout shift lớn  
\[ \] Không text tiếng Anh/Vietnamese trộn lung tung  
\[ \] Không button giả  
\[ \] Không dữ liệu giả mạo là realtime

\--------------------------------------------------  
\#\# 27\. CÁCH THỰC HIỆN  
\--------------------------------------------------

Đừng sửa tất cả một lần.

Làm theo thứ tự:

PHASE 1  
Audit architecture \+ data flow \+ state

PHASE 2  
Fix P0 functional/state bugs

PHASE 3  
Fix /events workflow

PHASE 4  
Fix dashboard/command

PHASE 5  
Fix shared Header \+ Sidebar

PHASE 6  
Fix map interaction

PHASE 7  
Responsive

PHASE 8  
Accessibility

PHASE 9  
Visual polish

PHASE 10  
Testing \+ build

Sau mỗi phase:  
\- kiểm tra TypeScript  
\- kiểm tra runtime  
\- không tạo regression

\--------------------------------------------------  
\#\# 28\. QUY TẮC QUAN TRỌNG  
\--------------------------------------------------

KHÔNG:

\- rewrite toàn bộ project nếu không cần  
\- thay đổi API contract chỉ để sửa UI  
\- tạo fake data mới để che lỗi  
\- dùng setTimeout để giả loading  
\- dùng "|| 0" làm fallback cho async data  
\- hide error bằng try/catch rỗng  
\- làm UI đẹp nhưng logic sai  
\- đổi routing  
\- phá component đang hoạt động  
\- bỏ tests

ƯU TIÊN:

correctness  
→ state consistency  
→ workflow  
→ usability  
→ responsive  
→ visual polish

\--------------------------------------------------  
\#\# 29\. OUTPUT BẮT BUỘC  
\--------------------------------------------------

Sau khi hoàn thành, báo cáo:

1\. Các bug P0 đã fix  
2\. Các bug P1 đã fix  
3\. UI/UX đã thay đổi  
4\. Data/state architecture đã thay đổi  
5\. Files/components đã sửa  
6\. Tests đã chạy  
7\. Build result  
8\. Những vấn đề còn lại nếu có

Format:

PASS — GIALAI EcoChain UI/UX \+ BUG FIX

P0:  
\- ...

P1:  
\- ...

UI/UX:  
\- ...

Data:  
\- ...

Testing:  
\- Typecheck: PASS/FAIL  
\- Lint: PASS/FAIL  
\- Tests: X/X  
\- Build: PASS/FAIL

Remaining:  
\- ...

Không được báo "done" nếu build/typecheck/runtime vẫn còn lỗi.  
\============================================================  
\#\# 30\. AI / PREDICTION / DETECTION — DEEP LOGIC AUDIT  
\============================================================

Đây là PHẦN BẮT BUỘC và phải được xem là một subsystem riêng.

Không được chỉ làm AI UI đẹp hơn.

Phải audit toàn bộ:

\- AI detection  
\- AI vision  
\- hotspot classification  
\- fire-risk prediction  
\- fire-level prediction  
\- AI recommendation  
\- confidence score  
\- anomaly detection  
\- weather/wind integration  
\- incident correlation  
\- prediction timeline  
\- AI-generated explanations

Mục tiêu:

AI phải đúng về LOGIC trước khi đúng về UI.

Không được để hệ thống đưa ra kết luận mạnh hơn dữ liệu đầu vào.

\------------------------------------------------------------  
\#\# 30.1 — PHÂN BIỆT "TÍN HIỆU" VÀ "SỰ CỐ"  
\------------------------------------------------------------

Đây là nguyên tắc quan trọng nhất.

FIRMS hotspot ≠ cháy rừng đã xác nhận.

AI detection ≠ cháy đã xác nhận.

AI prediction ≠ cháy sẽ xảy ra chắc chắn.

Anomaly ≠ incident.

Phải tách rõ các trạng thái:

SIGNAL  
→ tín hiệu quan sát được

DETECTION  
→ hệ thống phát hiện dấu hiệu đáng chú ý

ASSESSMENT  
→ AI đánh giá khả năng / mức độ rủi ro

INCIDENT  
→ sự cố được xác minh / ghi nhận

VERIFIED INCIDENT  
→ sự cố đã được xác minh bởi nguồn phù hợp

Không được tự động biến:

FIRMS hotspot  
→ ACTIVE FIRE

hoặc:

AI score 0.8  
→ CHÁY CẤP IV

nếu không có logic và dữ liệu xác minh tương ứng.

\------------------------------------------------------------  
\#\# 30.2 — AI CONFIDENCE KHÔNG ĐƯỢC GIẢ MẠO  
\------------------------------------------------------------

Tìm toàn bộ code có:

confidence  
score  
probability  
risk  
severity  
prediction  
accuracy

Kiểm tra xem các giá trị có thực sự xuất phát từ model/data hay chỉ là hardcoded/random/demo number.

Cấm các pattern kiểu:

Math.random()

confidence \= 0.85

risk \= 0.9

severity \= random...

hoặc các giá trị cố định được trình bày như kết quả AI thật.

Nếu project đang ở DEMO MODE và chưa có model thật:

UI phải ghi rõ:

"Điểm mô phỏng"

hoặc:

"AI mô phỏng"

Không được trình bày:

"AI confidence: 94%"

như thể đây là xác suất đã được model xác thực.

\------------------------------------------------------------  
\#\# 30.3 — PHÂN BIỆT CONFIDENCE VÀ PROBABILITY  
\------------------------------------------------------------

Không được gọi một score tùy ý là:

"94% probability"

nếu model chưa được calibration.

Phân biệt:

MODEL SCORE  
→ điểm đầu ra của model

CONFIDENCE  
→ độ tin cậy theo định nghĩa cụ thể

PROBABILITY  
→ xác suất có ý nghĩa thống kê

RISK SCORE  
→ điểm rủi ro tổng hợp

Nếu hiện tại chỉ có heuristic:

đặt tên:

Risk score

không gọi:

Probability of fire

\------------------------------------------------------------  
\#\# 30.4 — KIỂM TRA DATA LEAKAGE  
\------------------------------------------------------------

Audit toàn bộ pipeline prediction.

Đặc biệt kiểm tra:

\- dữ liệu tương lai có lọt vào feature không  
\- timestamp có bị dùng sai không  
\- weather forecast và actual weather có bị trộn không  
\- incident status sau thời điểm dự báo có được dùng làm feature không  
\- label có vô tình được đưa vào feature không  
\- dữ liệu của cùng một sự kiện có xuất hiện cả train/test không

Prediction tại thời điểm T chỉ được sử dụng thông tin có sẵn tại hoặc trước T.

TUYỆT ĐỐI KHÔNG:

dùng dữ liệu T+1 để dự đoán T.

\------------------------------------------------------------  
\#\# 30.5 — TEMPORAL SPLIT  
\------------------------------------------------------------

Nếu project có training/evaluation:

Không random split một cách mù quáng đối với dữ liệu chuỗi thời gian.

Ưu tiên:

TRAIN  
→ thời gian cũ

VALIDATION  
→ thời gian tiếp theo

TEST  
→ thời gian mới nhất

Phải kiểm tra:

train timestamp \< validation timestamp \< test timestamp

Nếu không có dataset/model thật:  
→ không được giả vờ có accuracy thực tế.

\------------------------------------------------------------  
\#\# 30.6 — GEOSPATIAL LEAKAGE  
\------------------------------------------------------------

Với dữ liệu cháy rừng, các điểm gần nhau có thể thuộc cùng một sự kiện.

Không được để:

hotspot A  
hotspot B  
hotspot C

cùng một fire event xuất hiện đồng thời trong train và test rồi báo accuracy cao.

Audit spatial leakage.

Nếu cần:  
\- group theo incident/event  
\- spatial split  
\- geographic holdout

\------------------------------------------------------------  
\#\# 30.7 — MISSING DATA  
\------------------------------------------------------------

AI phải xử lý:

\- thiếu FIRMS  
\- thiếu weather  
\- thiếu wind  
\- thiếu humidity  
\- thiếu vegetation  
\- thiếu historical fire  
\- missing coordinates  
\- stale data

Không được:

undefined → 0

hoặc:

null → default risk cao

mà không có lý do.

Phân biệt:

0  
≠  
missing  
≠  
unknown  
≠  
stale

Ví dụ:

wind \= 0 km/h

khác hoàn toàn:

wind data unavailable.

\------------------------------------------------------------  
\#\# 30.8 — STALE DATA  
\------------------------------------------------------------

Mỗi prediction phải biết freshness của input.

Ví dụ:

FIRMS:  
updated 12 min ago

Weather:  
updated 8 min ago

Wind:  
updated 15 min ago

Nếu dữ liệu quá cũ:

AI không được tiếp tục hiển thị:

LIVE PREDICTION

mà phải:

Prediction degraded  
Data stale

hoặc:

Unable to calculate reliable assessment

Tùy threshold được định nghĩa trong project.

\------------------------------------------------------------  
\#\# 30.9 — COORDINATE VALIDATION  
\------------------------------------------------------------

Audit toàn bộ latitude/longitude.

Phải kiểm tra:

\- lat trong \[-90, 90\]  
\- lng trong \[-180, 180\]  
\- không đảo lat/lng  
\- không phải NaN  
\- không phải undefined  
\- không phải 0,0 nếu đó là fallback  
\- đúng CRS nếu có conversion

Đặc biệt:

latitude \= longitude

hoặc:

lng/lat swap

là lỗi phải bắt được.

Nếu điểm nằm ngoài vùng Gia Lai:  
→ đánh dấu data anomaly hoặc không hiển thị vào regional analysis.

Không silently sửa tọa độ.

\------------------------------------------------------------  
\#\# 30.10 — DISTANCE / PROXIMITY LOGIC  
\------------------------------------------------------------

Audit toàn bộ:

distance  
radius  
nearby  
within X km  
nearest incident

Không được dùng:

Math.abs(lat1-lat2)

để đại diện trực tiếp cho khoảng cách địa lý.

Nếu cần khoảng cách:  
→ dùng Haversine hoặc geospatial library phù hợp.

Kiểm tra đơn vị:

m  
km  
degrees

Không được trộn.

Ví dụ:

5 km

không được vô tình hiểu thành:

5 degrees.

\------------------------------------------------------------  
\#\# 30.11 — DUPLICATE DETECTION  
\------------------------------------------------------------

FIRMS có thể có nhiều detection gần nhau.

Không được đếm:

5 hotspot cùng một sự kiện

thành:

5 incident.

Tách:

raw detections

và:

grouped events.

UI phải nói rõ:

139 detections  
→ 53 signals  
→ X grouped events  
→ Y verified incidents

nếu architecture của project hỗ trợ.

Nếu chưa có grouping:  
→ không tự ý gọi raw hotspot là incident.

\------------------------------------------------------------  
\#\# 30.12 — INCIDENT CORRELATION  
\------------------------------------------------------------

Nếu hệ thống group hotspot:

kiểm tra:

\- spatial distance  
\- temporal distance  
\- source  
\- confidence  
\- duplicate ID

Không group hai điểm chỉ vì chúng gần nhau nếu khác thời điểm quá xa.

Không group hai event chỉ vì cùng xã.

Không để một incident bị duplicate do:

\- API polling  
\- refresh  
\- route navigation  
\- realtime update

\------------------------------------------------------------  
\#\# 30.13 — FIRE LEVEL / CẤP CHÁY  
\------------------------------------------------------------

Audit logic:

Cấp I  
Cấp II  
Cấp III  
Cấp IV  
Cấp V

Không được dùng:

if risk \> x → cấp IV

nếu threshold chưa có cơ sở hoặc chưa được định nghĩa.

Tạo một rule/model definition rõ ràng:

INPUT  
\- risk score  
\- weather  
\- wind  
\- vegetation  
\- hotspot density  
\- historical context  
\- verified status

OUTPUT  
\- level

Mỗi threshold phải có comment/documentation.

Nếu đây chỉ là DEMO heuristic:  
→ ghi rõ:

"Phân loại mô phỏng theo bộ quy tắc demo"

Không trình bày như tiêu chuẩn nghiệp vụ thật.

Đặc biệt:

AI prediction không được tự nhận là "cấp cháy chính thức"  
nếu chưa có nguồn/quy trình xác nhận tương ứng.

\------------------------------------------------------------  
\#\# 30.14 — RISK SCORE MONOTONICITY  
\------------------------------------------------------------

Kiểm tra các quy tắc cơ bản.

Ví dụ nếu risk model định nghĩa:

wind tăng → risk không nên giảm vô lý

hotspot density tăng → risk không nên giảm vô lý

dryness tăng → risk không nên giảm vô lý

Nhưng không được giả định monotonicity nếu model thực sự không có tính chất đó.

Nếu là rule-based model:  
→ test các boundary cases.

\------------------------------------------------------------  
\#\# 30.15 — BOUNDARY CASES  
\------------------------------------------------------------

Test:

risk \= 0  
risk \= 0.01  
risk \= 0.49  
risk \= 0.50  
risk \= 0.99  
risk \= 1

hoặc toàn bộ threshold thực tế của project.

Kiểm tra:

\- không undefined  
\- không NaN  
\- không level trống  
\- không crash  
\- không overlap threshold  
\- không gap threshold

Ví dụ không được có:

0.59 → Level II  
0.60 → Level IV

trừ khi đó thực sự là business rule.

\------------------------------------------------------------  
\#\# 30.16 — NaN / Infinity / INVALID AI OUTPUT  
\------------------------------------------------------------

Mọi AI pipeline phải guard:

NaN  
Infinity  
\-Infinity  
undefined  
null  
negative probability  
probability \> 1

Ví dụ:

probability \= 1.37

không được render:

137%

Phải validate trước khi đưa vào UI.

\------------------------------------------------------------  
\#\# 30.17 — WEATHER / WIND LOGIC  
\------------------------------------------------------------

Audit integration với:

\- wind speed  
\- wind direction  
\- temperature  
\- humidity  
\- precipitation

Kiểm tra:

\- đơn vị °C / °F  
\- km/h / m/s  
\- degree / cardinal direction  
\- timestamp  
\- source  
\- missing values

Đặc biệt wind direction:

0°  
≠  
NE

Phải có mapping đúng:

N  
NE  
E  
SE  
S  
SW  
W  
NW

Kiểm tra wrap-around:

359°  
→ gần N

1°  
→ gần N

không phải hai hướng hoàn toàn khác nhau.

\------------------------------------------------------------  
\#\# 30.18 — AI RECOMMENDATION  
\------------------------------------------------------------

Audit toàn bộ AI Recommendation.

Không được để AI recommendation kiểu generic:

"Đã có điểm nóng — xác minh ngay"

cho mọi trường hợp.

Recommendation phải phụ thuộc context:

\- signal count  
\- confidence/score  
\- distance  
\- freshness  
\- weather  
\- wind  
\- severity  
\- verification state

Ví dụ khác nhau:

LOW CONFIDENCE  
→ Theo dõi / cần xác minh

MULTIPLE NEARBY SIGNALS  
→ Ưu tiên xác minh cụm tín hiệu

STALE DATA  
→ Cập nhật dữ liệu trước khi đánh giá

VERIFIED INCIDENT  
→ Chuyển workflow xử lý sự cố

Không được đưa recommendation hành động mạnh hơn evidence.

\------------------------------------------------------------  
\#\# 30.19 — AI EXPLANATION  
\------------------------------------------------------------

Nếu UI hiển thị:

"AI phát hiện nguy cơ cao"

phải có:

WHY?

Ví dụ:

Risk score: 0.72

Factors:  
\- 3 FIRMS signals nearby  
\- wind 18 km/h  
\- dry conditions  
\- recent signal

Không được:

"AI cho rằng nguy cơ cao"

mà không giải thích được dựa trên feature nào.

Nếu model không hỗ trợ explainability:  
→ nói rõ:

"Đánh giá tự động"

không giả tạo explanation.

\------------------------------------------------------------  
\#\# 30.20 — AI TEMPORAL CONSISTENCY  
\------------------------------------------------------------

Không để prediction nhảy:

LOW  
→ CRITICAL  
→ LOW  
→ HIGH

mỗi lần component re-render.

Prediction phải deterministic với cùng input.

Audit:

\- random number  
\- Date.now()  
\- render side effects  
\- polling race condition  
\- stale closure  
\- async response race

Hai request cũ/mới trả về ngược thứ tự không được làm UI quay lại prediction cũ.

\------------------------------------------------------------  
\#\# 30.21 — RACE CONDITIONS  
\------------------------------------------------------------

Đặc biệt audit:

weather fetch  
FIRMS fetch  
AI analysis  
map update  
event selection

Ví dụ:

Request A bắt đầu  
Request B bắt đầu sau

B trả về trước  
A trả về sau

Không được để A overwrite B bằng dữ liệu cũ.

Dùng:

AbortController  
request ID  
timestamp/version check

hoặc cơ chế tương đương phù hợp architecture.

\------------------------------------------------------------  
\#\# 30.22 — CACHE INVALIDATION  
\------------------------------------------------------------

Audit cache.

Không được:

UI nói LIVE

nhưng thực tế đang hiển thị cache từ nhiều giờ trước.

Mỗi cache phải có:

createdAt  
updatedAt  
expiresAt nếu cần  
source

Khi refresh:

\- không duplicate  
\- không stale overwrite fresh  
\- không reset state về 0  
\- không nhấp nháy UI

\------------------------------------------------------------  
\#\# 30.23 — AI LOADING STATE  
\------------------------------------------------------------

Không hiển thị:

AI confidence  
AI risk  
AI recommendation

trước khi model hoàn thành.

Không được hiển thị:

Risk: 0

khi đang loading.

Dùng:

AI đang phân tích...

hoặc skeleton.

\------------------------------------------------------------  
\#\# 30.24 — AI FAILURE  
\------------------------------------------------------------

Nếu AI service/model lỗi:

Không được fallback thành:

Risk \= 0

vì điều đó có nghĩa "không có nguy cơ".

Phải:

AI unavailable

hoặc:

Không thể đánh giá AI

Sau đó nếu có heuristic fallback:

Heuristic assessment

và phải nói rõ.

Không biến AI failure thành false negative.

\------------------------------------------------------------  
\#\# 30.25 — MODEL VERSION  
\------------------------------------------------------------

Nếu có model:

hiển thị metadata nội bộ:

model version  
data version  
analysis timestamp

Ví dụ:

AI model v1.2  
Analyzed 22:10

Nếu chưa có model thật:

Demo heuristic v1

Không được giả mạo model version.

\------------------------------------------------------------  
\#\# 30.26 — AI AUDIT TRAIL  
\------------------------------------------------------------

Mỗi AI assessment nên có:

input timestamp  
analysis timestamp  
model/rule version  
result  
confidence/score nếu hợp lệ  
data sources  
fallback status

Để có thể debug:

"Tại sao AI lúc 22:10 lại đưa ra kết quả này?"

\------------------------------------------------------------  
\#\# 30.27 — PREDICTION EVALUATION  
\------------------------------------------------------------

Nếu project có model thật:

KHÔNG chỉ báo:

Accuracy: 95%

Phải kiểm tra:

precision  
recall  
F1  
ROC-AUC / PR-AUC nếu phù hợp  
confusion matrix  
calibration  
false positive  
false negative

Đối với wildfire/fire detection:

false negative và false positive phải được phân tích riêng.

Không dùng accuracy đơn độc khi class imbalance cao.

Nếu chưa có evaluation dataset:  
→ tuyệt đối không bịa accuracy.

Hiển thị:

"Chưa có benchmark"

thay vì:

"95% accuracy".

\------------------------------------------------------------  
\#\# 30.28 — CLASS IMBALANCE  
\------------------------------------------------------------

Kiểm tra dataset:

normal  
vs  
fire

Nếu fire events hiếm:

accuracy cao không đồng nghĩa model tốt.

Ví dụ:

99% normal  
1% fire

model luôn dự đoán normal  
→ accuracy 99%

nhưng không phát hiện được fire.

Phải kiểm tra class distribution.

\------------------------------------------------------------  
\#\# 30.29 — FALSE POSITIVE / FALSE NEGATIVE  
\------------------------------------------------------------

Tạo test cases:

Case A:  
FIRMS signal nhưng không có fire verification

→ không được tự động thành confirmed fire.

Case B:  
không có FIRMS signal nhưng có verified incident

→ hệ thống không được kết luận "không có cháy".

Case C:  
weather missing

→ prediction phải degraded/uncertain.

Case D:  
stale FIRMS

→ không được gọi LIVE.

Case E:  
duplicate hotspots

→ không double-count incident.

\------------------------------------------------------------  
\#\# 30.30 — AI UI HONESTY  
\------------------------------------------------------------

Audit tất cả wording.

Không dùng:

"AI xác nhận cháy"

nếu AI chỉ detection.

Không dùng:

"Chắc chắn cháy"

Không dùng:

"Cháy sẽ xảy ra"

Không dùng:

"AI dự đoán chính xác"

nếu không có evidence.

Ưu tiên:

"Phát hiện tín hiệu"

"Đánh giá rủi ro"

"Khả năng cần xác minh"

"Tín hiệu chưa được xác minh"

"Đánh giá tự động"

"Không đủ dữ liệu"

\------------------------------------------------------------  
\#\# 30.31 — AI SHOULD NEVER HIDE UNCERTAINTY  
\------------------------------------------------------------

Nếu input thiếu hoặc model không chắc chắn:

hãy thể hiện uncertainty.

Ví dụ:

AI assessment  
Không đủ dữ liệu

Thay vì:

Risk: Low

vì "Low" có thể bị hiểu thành model đã xác định nguy cơ thấp.

\------------------------------------------------------------  
\#\# 30.32 — DEMO AI  
\------------------------------------------------------------

Nếu AI hiện tại là simulation:

Tách rõ:

DEMO ENGINE  
↓  
Synthetic / simulated data  
↓  
Rule-based assessment

Không được gọi:

Production AI

Không được fake:

model accuracy  
confidence  
prediction history  
training data  
model version

nếu những thứ đó không tồn tại.

Có thể mô phỏng để demo nhưng phải gắn:

DEMO

\------------------------------------------------------------  
\#\# 30.33 — AI TEST MATRIX  
\------------------------------------------------------------

Tạo automated tests tối thiểu cho:

1\. valid input  
2\. empty input  
3\. null input  
4\. missing weather  
5\. missing FIRMS  
6\. stale FIRMS  
7\. invalid coordinates  
8\. duplicate detection  
9\. duplicate incident  
10\. NaN score  
11\. score \< 0  
12\. score \> 1  
13\. threshold boundary  
14\. concurrent requests  
15\. out-of-order responses  
16\. model unavailable  
17\. fallback mode  
18\. no verification  
19\. verified incident  
20\. refresh page  
21\. route navigation  
22\. offline  
23\. reconnect  
24\. DEMO mode  
25\. LIVE mode

\------------------------------------------------------------  
\#\# 30.34 — AI REGRESSION TEST  
\------------------------------------------------------------

Tạo deterministic fixture data.

Cùng input:

same data  
same timestamp  
same model/rule version

→ phải cho cùng result.

Không dùng random trong production logic.

Nếu simulation cần random:  
→ seed random generator.

\------------------------------------------------------------  
\#\# 30.35 — AI / MAP CONSISTENCY  
\------------------------------------------------------------

Nếu AI đánh giá marker A:

Map  
→ marker A

List  
→ signal A

Detail  
→ signal A

AI panel  
→ signal A

Tất cả phải dùng cùng ID.

Không được dùng index:

items\[3\]

để liên kết entity.

Dùng stable ID.

\------------------------------------------------------------  
\#\# 30.36 — AI / DATA SOURCE TRACEABILITY  
\------------------------------------------------------------

Mọi prediction phải có khả năng trả lời:

"Prediction này dựa trên dữ liệu nào?"

Ví dụ:

Sources:  
\- FIRMS  
\- Weather  
\- Wind  
\- Historical data

Updated:  
22:10

Nếu source unavailable:

Source unavailable

Không giả tạo.

\------------------------------------------------------------  
\#\# 30.37 — PREDICTION UX  
\------------------------------------------------------------

Prediction card phải hiển thị:

Prediction  
Risk assessment

Result  
High / Moderate / Low / Insufficient data

Confidence/score  
chỉ khi có ý nghĩa

Updated  
timestamp

Data quality  
Good / Degraded / Stale

Why  
các yếu tố chính

Không nhồi tất cả thành một con số lớn.

\------------------------------------------------------------  
\#\# 30.38 — "NO DATA" PHẢI KHÁC "LOW RISK"  
\------------------------------------------------------------

Đây là bug cực kỳ quan trọng.

Các trạng thái:

NO DATA  
LOW RISK  
UNKNOWN  
AI UNAVAILABLE  
STALE DATA

không được map thành cùng một UI state.

Ví dụ:

NO DATA  
→ "Chưa đủ dữ liệu"

LOW RISK  
→ "Nguy cơ thấp"

AI UNAVAILABLE  
→ "Không thể đánh giá AI"

STALE  
→ "Dữ liệu đã cũ"

UNKNOWN  
→ "Chưa xác định"

\------------------------------------------------------------  
\#\# 30.39 — GLOBAL AI ERROR BOUNDARY  
\------------------------------------------------------------

AI component crash không được làm crash toàn bộ dashboard.

Tạo error boundary phù hợp:

AI module error  
→ fallback UI

Dashboard vẫn hoạt động.

Ví dụ:

"Không thể tải phân tích AI"

\[Thử lại\]

\------------------------------------------------------------  
\#\# 30.40 — AI LOGGING / DEBUG  
\---------------------------------------------------  
\#\# 30.40 — AI LOGGING / DEBUG  
\------------------------------------------------------------

Trong development:

log rõ:

input  
model/rule  
output  
latency  
fallback  
error

Nhưng production:

không log sensitive data  
không spam console  
không log toàn bộ payload lớn.

\------------------------------------------------------------  
\#\# 30.41 — FINAL AI ACCEPTANCE CRITERIA  
\------------------------------------------------------------

Chỉ coi AI subsystem là PASS khi:

\[ \] Không fake confidence  
\[ \] Không fake probability  
\[ \] Không fake accuracy  
\[ \] Không dùng random prediction  
\[ \] Không biến hotspot thành confirmed fire  
\[ \] Không biến missing data thành low risk  
\[ \] Không biến AI failure thành risk \= 0  
\[ \] Không có stale prediction được gọi LIVE  
\[ \] Không có duplicate incident  
\[ \] Không có duplicate counting  
\[ \] Không có coordinate corruption  
\[ \] Không có lat/lng swap  
\[ \] Không có NaN/Infinity  
\[ \] Threshold không có gap  
\[ \] Threshold không overlap  
\[ \] Prediction deterministic  
\[ \] Không có race condition  
\[ \] Không có stale response overwrite  
\[ \] Không có data leakage nếu có training  
\[ \] Không có temporal leakage  
\[ \] Không có spatial leakage  
\[ \] Không claim accuracy nếu chưa benchmark  
\[ \] Recommendation dựa trên context  
\[ \] AI explanation không bịa  
\[ \] Data source traceable  
\[ \] Timestamp rõ ràng  
\[ \] Model/rule version rõ ràng  
\[ \] Demo AI được ghi rõ là DEMO  
\[ \] AI không crash toàn app  
\[ \] AI state có loading/success/empty/error/degraded  
\[ \] Map/list/detail dùng cùng stable ID  
\[ \] Refresh không làm prediction nhảy sai  
\[ \] Offline/reconnect không tạo duplicate  
\[ \] Test matrix pass

\============================================================  
\#\# 31\. DEEP BUG HUNT — TÌM CẢ LỖI KHÔNG NHÌN THẤY TRÊN UI  
\============================================================

Sau khi sửa các lỗi trên, không được dừng ở screenshot.

Thực hiện static \+ runtime audit toàn project.

Tìm:

\- race condition  
\- stale state  
\- stale closure  
\- memory leak  
\- event listener leak  
\- timer leak  
\- polling leak  
\- duplicate fetch  
\- duplicate API call  
\- infinite render  
\- infinite effect  
\- missing dependency trong useEffect  
\- unstable dependency  
\- missing React key  
\- unstable React key  
\- index dùng làm key  
\- uncontrolled/controlled warning  
\- hydration mismatch nếu có SSR  
\- map initialization nhiều lần  
\- map container không cleanup  
\- websocket không cleanup  
\- subscription không cleanup  
\- fetch không abort  
\- request cũ overwrite request mới  
\- route change nhưng request cũ vẫn update state  
\- state reset sai khi refresh  
\- localStorage corrupt  
\- JSON.parse không có guard  
\- date parsing sai timezone  
\- UTC/local timezone bug  
\- daylight/time formatting bug  
\- number formatting bug  
\- unit conversion bug  
\- negative/NaN values  
\- division by zero  
\- empty array access  
\- undefined property access  
\- null reference  
\- duplicate IDs  
\- duplicate markers  
\- duplicate events  
\- pagination bug  
\- infinite scroll bug  
\- filter state mismatch  
\- sorting state mismatch  
\- search result stale  
\- debounce cleanup  
\- map/list selection mismatch

\============================================================  
\#\# 32\. TIME / DATE / TIMEZONE AUDIT  
\============================================================

Vì đây là hệ thống realtime:

audit toàn bộ date/time.

Không được trộn:

UTC  
Asia/Ho\_Chi\_Minh  
browser local time

Mọi timestamp từ API phải parse rõ ràng.

Không dùng:

new Date("2026-10-02 22:10:00")

nếu format không chuẩn ISO và có thể gây khác timezone.

Ưu tiên timestamp có timezone.

UI phải thống nhất:

02/10/2026 22:10

và không được một chỗ hiển thị:

22:10

chỗ khác:

10:10 PM

chỗ khác:

2026-10-02T15:10:00Z

nếu không có lý do.

\============================================================  
\#\# 33\. FILTER / SEARCH / SORT CONSISTENCY  
\============================================================

Audit toàn bộ filter:

\- cấp cháy  
\- thời gian  
\- nguồn  
\- trạng thái  
\- AI  
\- FIRMS

Khi filter thay đổi:

Map  
List  
KPI  
Count  
Detail

phải cập nhật cùng một state.

Không để:

List \= 12

Map \= 53

KPI \= 139

mà người dùng không biết mỗi số đang áp dụng filter nào.

Hiển thị filter context rõ:

"53 tín hiệu · 30 ngày · Tất cả cấp"

\============================================================  
\#\# 34\. REFRESH / RECONNECT TEST  
\============================================================

Test thực tế:

1\. mở dashboard  
2\. refresh  
3\. chuyển /events  
4\. refresh  
5\. mất mạng  
6\. bật mạng  
7\. đổi filter trong lúc loading  
8\. click marker trong lúc loading  
9\. chuyển route trong lúc AI đang phân tích  
10\. quay lại route

Không được:

\- duplicate request  
\- duplicate marker  
\- reset sai data  
\- crash  
\- loading vô hạn  
\- result cũ overwrite result mới

\============================================================  
\#\# 35\. ACCEPTANCE PRINCIPLE  
\============================================================

Một nguyên tắc xuyên suốt:

"Không biết" phải được biểu diễn là "Không biết".

"Chưa tải" phải được biểu diễn là "Đang tải".

"Không có dữ liệu" phải được biểu diễn là "Không có dữ liệu".

"Dữ liệu cũ" phải được biểu diễn là "Dữ liệu cũ".

"AI lỗi" phải được biểu diễn là "AI lỗi".

"AI chưa xác minh" phải được biểu diễn là "Chưa xác minh".

KHÔNG ĐƯỢC biến tất cả thành:

0  
LOW  
SAFE  
NO INCIDENT  
hoặc SUCCESS.

Đặc biệt:

absence of evidence ≠ evidence of absence.

\============================================================  
\#\# 36\. FINAL AUDIT REPORT — BỔ SUNG  
\============================================================

Trong báo cáo cuối cùng thêm:

\#\#\# AI / Prediction  
\- AI engine hiện tại là gì:  
\- Production model / heuristic / demo:  
\- Input sources:  
\- Prediction pipeline:  
\- Confidence semantics:  
\- Risk semantics:  
\- Fallback:  
\- Model/rule version:  
\- Data freshness:  
\- Known limitations:

\#\#\# Logic Bugs  
\- ...  
\- ...

\#\#\# Prediction Bugs  
\- ...  
\- ...

\#\#\# Data Integrity  
\- ...  
\- ...

\#\#\# Race Conditions  
\- ...  
\- ...

\#\#\# False Positive / False Negative Risks  
\- ...  
\- ...

\#\#\# Tests  
\- AI unit tests:  
\- prediction edge cases:  
\- data validation:  
\- race-condition tests:  
\- offline tests:  
\- refresh/reconnect tests:

KHÔNG được viết "AI đã hoạt động tốt" nếu chưa có benchmark/evaluation thực tế.

Nếu chưa có model thật, phải ghi rõ:

"AI hiện tại là heuristic/demo engine, chưa phải model ML đã benchmark."

\============================================================  
\#\# 37\. ĐẶC BIỆT: KHÔNG CHE BUG BẰNG UI  
\============================================================

Nếu phát hiện backend/API/data pipeline có vấn đề:

KHÔNG được chỉ sửa UI để che.

Ví dụ:

API trả null  
→ KHÔNG biến thành 0\.

AI timeout  
→ KHÔNG biến thành Low Risk.

FIRMS không tải được  
→ KHÔNG dùng data cũ nhưng gắn LIVE.

Prediction undefined  
→ KHÔNG gán random score.

Map không có coordinate  
→ KHÔNG đặt marker tại 0,0.

Model không tồn tại  
→ KHÔNG tạo fake confidence.

Phải trace đến root cause và nếu không thể sửa upstream:

hiển thị trạng thái degraded/error minh bạch.

\============================================================  
\#\# 38\. ƯU TIÊN FIX CUỐI CÙNG  
\============================================================

Thứ tự bắt buộc:

P0:  
Data corruption  
AI false claim  
prediction logic error  
state inconsistency  
race condition  
duplicate event  
wrong coordinates  
wrong timestamps  
wrong severity  
wrong count

P1:  
AI recommendation sai context  
stale data  
missing/error state  
filter inconsistency  
map/list inconsistency  
refresh/reconnect bugs

P2:  
UX  
responsive  
accessibility  
interaction

P3:  
visual polish  
animation  
micro-interaction

Không được ưu tiên gradient, shadow, animation hoặc border trước khi P0/P1 sạch.   
\============================================================  
\#\# 39\. REAL-WORLD READINESS — BIẾN TOÀN BỘ APP THÀNH HỆ THỐNG CÓ GIÁ TRỊ THỰC TẾ  
\============================================================

Đây là yêu cầu CỐT LÕI của PASS này.

GIALAI EcoChain không được chỉ là một dashboard đẹp để trình diễn.

Mọi số liệu, AI, bản đồ, cảnh báo, sự kiện, chatbot, dự báo, tài sản, chỉ huy, mô phỏng và recommendation đã được tạo ra phải có:

INPUT  
→ PROCESSING  
→ RESULT  
→ CONTEXT  
→ ACTION  
→ FEEDBACK

Một chức năng chỉ được coi là hoàn thiện nếu người dùng hiểu:

1\. Nó lấy dữ liệu từ đâu?  
2\. Dữ liệu đó có ý nghĩa gì?  
3\. Hệ thống xử lý nó như thế nào?  
4\. Kết quả có độ tin cậy ra sao?  
5\. Kết quả ảnh hưởng đến chức năng nào khác?  
6\. Người dùng có thể làm gì tiếp theo?  
7\. Sau hành động đó hệ thống cập nhật gì?

KHÔNG tạo UI chỉ để "trông có vẻ thông minh".

\============================================================  
\#\# 39.1 — SỐ LIỆU PHẢI HỢP THỰC TẾ  
\============================================================

Tất cả số liệu trên hệ thống phải có nguồn gốc và logic.

Không được tạo số liệu tùy ý chỉ để card nhìn đẹp.

Đặc biệt audit:

\- FIRMS hotspots  
\- signals  
\- incidents  
\- alerts  
\- fire level  
\- risk score  
\- wind  
\- temperature  
\- humidity  
\- precipitation  
\- affected area  
\- distance  
\- response time  
\- assets  
\- personnel  
\- AI confidence  
\- prediction  
\- historical statistics

Mỗi metric phải trả lời được:

SOURCE:  
Dữ liệu từ đâu?

TIME:  
Dữ liệu thuộc thời điểm nào?

UNIT:  
Đơn vị gì?

SCOPE:  
Phạm vi địa lý nào?

DEFINITION:  
Metric này thực sự có nghĩa gì?

FRESHNESS:  
Dữ liệu còn mới không?

Nếu là DEMO:

phải ghi rõ:

DEMO / SIMULATED

Không được giả lập số liệu rồi trình bày như dữ liệu thực tế.

\============================================================  
\#\# 39.2 — KHÔNG "FAKE REALISM"  
\============================================================

Không làm kiểu:

139 hotspots  
53 signals  
3.3 km/h  
26.0°C  
87% confidence

chỉ để giao diện có vẻ giống hệ thống thật.

Nếu con số đó không có pipeline tạo ra nó:

→ loại bỏ

hoặc:

→ thay bằng dữ liệu fixture có cấu trúc và ghi rõ DEMO.

Mỗi số liệu demo phải được sinh từ một dataset/rule nhất quán.

Ví dụ:

Không được:

hotspots \= 139  
signals \= 53

mỗi nơi hardcode riêng.

Phải:

rawDetections  
→ filter  
→ deduplicate  
→ classify  
→ aggregate  
→ derive KPIs

Khi raw data thay đổi:  
→ KPI tự thay đổi theo.

\============================================================  
\#\# 39.3 — SINGLE SOURCE OF TRUTH  
\============================================================

Thiết lập một canonical domain model.

Ví dụ:

Detection  
Signal  
Incident  
Alert  
Assessment  
Prediction  
Asset  
ResponseTask

Các UI không được tự tạo lại dữ liệu riêng.

Ví dụ:

Map  
List  
Dashboard  
Command Center  
Event Intelligence  
AI  
Chatbot

phải cùng truy cập domain state / normalized data.

Không được:

Map dùng mock A  
Dashboard dùng mock B  
AI dùng mock C  
Chatbot dùng mock D

Nếu cùng nói về một hotspot:

→ phải có cùng ID.

\============================================================  
\#\# 39.4 — ENTITY IDENTITY  
\============================================================

Mọi entity quan trọng phải có stable ID:

signalId  
incidentId  
alertId  
assetId  
predictionId  
taskId

Không dùng:

array index

để nhận diện entity.

Ví dụ:

signal\_001

phải được sử dụng xuyên suốt:

Map  
→ Event List  
→ Detail  
→ AI  
→ Recommendation  
→ Command  
→ Chatbot  
→ Audit Trail

\============================================================  
\#\# 39.5 — EVENT LIFECYCLE THỰC TẾ  
\============================================================

Thiết kế lifecycle rõ ràng:

RAW SIGNAL  
↓  
INGESTED  
↓  
NORMALIZED  
↓  
VALIDATED  
↓  
CORRELATED  
↓  
ASSESSED  
↓  
NEEDS VERIFICATION  
↓  
VERIFIED / DISMISSED  
↓  
INCIDENT  
↓  
RESPONSE  
↓  
RESOLVED  
↓  
ARCHIVED

Không được nhảy:

FIRMS  
→ INCIDENT

mà không có bước trung gian.

Nếu project demo chưa có xác minh thực địa:

phải mô phỏng workflow nhưng ghi rõ:

SIMULATED WORKFLOW

\============================================================  
\#\# 39.6 — INCIDENT MANAGEMENT PHẢI CÓ Ý NGHĨA  
\============================================================

"Active Incident" không chỉ là một card.

Một incident phải có:

ID  
Location  
Detected at  
Last updated  
Source  
Status  
Severity  
Risk  
Evidence  
Related signals  
Related alerts  
Assigned unit nếu có  
Actions  
Timeline

Ví dụ:

INC-2026-001

Status:  
Needs verification

Related signals:  
3

Risk:  
Moderate

Last updated:  
22:10

Actions:  
\[Verify\]  
\[Assign\]  
\[Track\]  
\[Open map\]

Khi user thao tác:

Verify  
→ incident status thay đổi

Assign  
→ task/personnel liên quan thay đổi

Track  
→ theo dõi incident

Resolve  
→ incident lifecycle cập nhật

Không làm button giả.

\============================================================  
\#\# 39.7 — ALERT PHẢI CÓ NGUYÊN NHÂN  
\============================================================

Không tạo alert chỉ vì:

risk \> 0.5

Mọi alert phải có:

trigger  
threshold/rule  
source  
severity  
timestamp  
target entity  
status  
acknowledgement  
resolution

Ví dụ:

ALERT-001

Trigger:  
3 correlated FIRMS signals within 2 km / 30 min

Severity:  
High

Entity:  
SIG-001

Status:  
Unacknowledged

Action:  
\[Review\]

Nếu không có rule thực sự:  
→ không tạo alert.

\============================================================  
\#\# 39.8 — ALERT ≠ INCIDENT  
\============================================================

Phải phân biệt:

Signal  
Alert  
Incident

Ví dụ:

Signal:  
vệ tinh phát hiện hotspot

Alert:  
hệ thống thấy pattern đáng chú ý

Incident:  
sự cố được xác nhận / đưa vào workflow xử lý

Không được dùng ba khái niệm này lẫn nhau.

\============================================================  
\#\# 39.9 — AI PHẢI KẾT NỐI TOÀN HỆ THỐNG  
\============================================================

AI không được là một widget độc lập.

AI phải có khả năng sử dụng context từ:

Eco Map  
FIRMS  
Weather  
Wind  
Event Intelligence  
Command Center  
Incidents  
Alerts  
Assets  
Historical data  
What-if Lab  
Simulation  
User-selected location/event

Và output của AI phải có thể quay trở lại:

Event Intelligence  
Command Center  
Map  
Alert  
Incident  
Recommendation  
What-if Lab  
Chatbot

Ví dụ:

User chọn FIRMS signal  
↓  
AI phân tích  
↓  
Risk assessment  
↓  
Recommendation  
↓  
Command Center  
↓  
Tạo verification task  
↓  
Task xuất hiện trong incident workflow  
↓  
Map cập nhật status

Đây mới là AI integration thực sự.

\============================================================  
\#\# 39.10 — AI CONTEXT ENGINE  
\============================================================

Không gọi AI bằng prompt trống kiểu:

"Phân tích điểm này."

Phải xây context object.

Ví dụ:

{  
  signalId,  
  coordinates,  
  detectedAt,  
  source,  
  nearbySignals,  
  weather,  
  wind,  
  humidity,  
  vegetation,  
  historicalEvents,  
  currentIncidents,  
  alerts,  
  dataFreshness,  
  verificationStatus  
}

AI chỉ được đưa ra kết luận dựa trên context thực tế đó.

\============================================================  
\#\# 39.11 — AI PHẢI HIỂU TRẠNG THÁI HỆ THỐNG  
\============================================================

AI phải biết:

\- hệ thống LIVE hay DEMO  
\- data source nào đang online  
\- dữ liệu nào stale  
\- dữ liệu nào missing  
\- AI model có available không  
\- prediction có degraded không

Nếu FIRMS offline:

Chatbot không được trả lời:

"Hiện Gia Lai có 53 hotspot mới."

mà phải biết:

"Dữ liệu FIRMS hiện đang ở trạng thái cache/fallback..."

nếu đó là trạng thái thực tế.

\============================================================  
\#\# 39.12 — CHATBOT PHẢI LÀ TRỢ LÝ NGHIỆP VỤ  
\============================================================

Chatbot hiện không được chỉ là:

một ô chat trả lời câu hỏi chung chung.

Nó phải hiểu toàn bộ domain của GIALAI EcoChain.

Chatbot phải trả lời được:

\- Có bao nhiêu tín hiệu cần xác minh?  
\- Tín hiệu nào đáng chú ý?  
\- Tại sao tín hiệu này được ưu tiên?  
\- Có incident nào đang hoạt động?  
\- Incident nào chưa được xử lý?  
\- Khu vực nào đang có nhiều tín hiệu?  
\- Gió đang hướng nào?  
\- Dữ liệu cập nhật lúc nào?  
\- Dữ liệu có stale không?  
\- Có cảnh báo nào chưa acknowledge?  
\- Incident này liên quan đến những signal nào?  
\- Có tài sản/đơn vị nào được phân công?  
\- Tình hình thay đổi thế nào trong 30 phút / 24 giờ?  
\- Vì sao AI đánh giá rủi ro như vậy?  
\- Nếu điều kiện gió thay đổi thì ảnh hưởng thế nào?  
\- Hiện đang ở DEMO hay LIVE?  
\- Nguồn dữ liệu là gì?

\============================================================  
\#\# 39.13 — CHATBOT PHẢI GROUND VÀO APP STATE  
\============================================================

Chatbot KHÔNG được tự bịa câu trả lời.

Trước khi trả lời, phải query domain state / data services phù hợp.

Ví dụ:

User:  
"Có bao nhiêu điểm nóng?"

Chatbot:

Không tự đoán.

→ query canonical hotspot data  
→ apply current filter/time range  
→ calculate count  
→ trả lời  
→ kèm timestamp/source.

User:  
"Điểm nào nguy hiểm nhất?"

Không tự chọn dựa trên cảm tính.

→ lấy danh sách signal  
→ áp dụng risk ranking đã định nghĩa  
→ giải thích criteria  
→ trả kết quả.

Không dùng LLM để thay thế business logic.

LLM dùng để:  
\- hiểu câu hỏi  
\- tổng hợp  
\- giải thích  
\- giao tiếp

Business engine dùng để:  
\- tính toán  
\- lọc  
\- ranking  
\- validation  
\- state transition

\============================================================  
\#\# 39.14 — CHATBOT KHÔNG ĐƯỢC BỊA SỐ LIỆU  
\============================================================

Nếu chatbot không có dữ liệu:

"Hiện tôi không có dữ liệu đủ mới để xác định."

Không được:

ước lượng  
đoán  
hallucinate  
suy diễn thành fact.

Nếu data stale:

"Dữ liệu gần nhất được cập nhật X phút trước."

Nếu DEMO:

"Đây là dữ liệu mô phỏng trong chế độ DEMO."

\============================================================  
\#\# 39.15 — CHATBOT PHẢI TRẢ LỜI CÓ CẤU TRÚC  
\============================================================

Ví dụ:

User:  
"Điểm SIG-001 thế nào?"

Chatbot:

SIG-001

Trạng thái:  
Chưa xác minh

Vị trí:  
...

Tín hiệu:  
...

Thời điểm:  
...

Dữ liệu liên quan:  
...

Đánh giá:  
...

Lý do:  
...

Đề xuất:  
...

Nguồn:  
...

Cập nhật:  
...

\[ Mở trên bản đồ \]  
\[ Xem sự kiện \]

Không trả lời một đoạn văn dài không cấu trúc.

\============================================================  
\#\# 39.16 — CHATBOT CÓ ACTIONS  
\============================================================

Nếu architecture cho phép, chatbot phải có action intents:

OPEN\_SIGNAL  
OPEN\_INCIDENT  
SHOW\_ON\_MAP  
FILTER\_EVENTS  
OPEN\_ANALYSIS  
OPEN\_WHAT\_IF  
VIEW\_ALERT  
VIEW\_ASSET  
CREATE\_VERIFICATION\_TASK

Ví dụ:

User:  
"Mở điểm nóng gần nhất."

Chatbot:  
→ xác định signal  
→ map flyTo  
→ mở detail

Không chỉ nói:

"Bạn có thể mở bản đồ."

\============================================================  
\#\# 39.17 — CHATBOT \+ MAP  
\============================================================

Chatbot và Map phải chia sẻ context.

User:  
"Điểm này có đáng chú ý không?"

Nếu user đang selected signal:

AI hiểu:

selectedSignalId

Không bắt user nhập lại:

tọa độ  
ID  
địa điểm

Chatbot trả lời dựa trên entity đang active.

\============================================================  
\#\# 39.18 — CHATBOT \+ EVENT INTELLIGENCE  
\============================================================

User có thể hỏi:

"Hiện có bao nhiêu tín hiệu cần xác minh?"

Chatbot lấy đúng filtered dataset.

Nếu user đang filter:

30 ngày  
Cấp II+  
Một khu vực

→ chatbot phải hiểu filter context nếu UX cho phép.

Không trả count toàn hệ thống nếu UI đang hiển thị subset mà không nói rõ.

\============================================================  
\#\# 39.19 — CHATBOT \+ COMMAND CENTER  
\============================================================

Chatbot phải hiểu operational context:

\- active incidents  
\- pending verification  
\- unacknowledged alerts  
\- assigned tasks  
\- available assets

Ví dụ:

"Còn việc gì chưa xử lý?"

→ tổng hợp từ task/incident state.

Không tạo câu trả lời chung chung.

\============================================================  
\#\# 39.20 — AI \+ WHAT-IF LAB  
\============================================================

What-if Lab không được độc lập với AI.

Ví dụ user thay đổi:

wind speed  
wind direction  
temperature  
humidity  
dryness  
number of signals

What-if engine phải:

1\. lấy baseline data  
2\. thay đổi scenario variables  
3\. chạy rule/model  
4\. tính lại risk  
5\. so sánh baseline vs scenario  
6\. giải thích thay đổi  
7\. hiển thị uncertainty

Ví dụ:

Baseline:  
Risk score 0.48

Scenario:  
Wind \+10 km/h

New:  
Risk score 0.61

Change:  
\+0.13

Reason:  
wind factor tăng theo model/rule hiện tại.

Không được hardcode:

wind tăng → risk \+20%.

Phải đi qua cùng risk engine mà hệ thống thật sử dụng.

\============================================================  
\#\# 39.21 — WHAT-IF \+ MAP  
\============================================================

Nếu scenario ảnh hưởng spatial risk:

Map phải có scenario layer.

Ví dụ:

Baseline  
Scenario  
Difference

User thay đổi wind direction:

→ map layer cập nhật hướng/ảnh hưởng nếu model hỗ trợ.

Nếu model không đủ khả năng mô phỏng:  
→ không fake heatmap.

Hiển thị:

"Scenario visualization unavailable with current model."

\============================================================  
\#\# 39.22 — AI \+ WEATHER  
\============================================================

Weather không chỉ là KPI.

Phải được sử dụng đúng nơi:

Map  
→ context

Event  
→ assessment

AI  
→ risk feature nếu model hỗ trợ

What-if  
→ scenario variable

Chatbot  
→ trả lời context

Command  
→ operational context

Một dữ liệu nên có lifecycle xuyên suốt app.

\============================================================  
\#\# 39.23 — AI \+ HISTORICAL DATA  
\============================================================

Historical data phải có tác dụng thực tế.

Ví dụ:

\- so sánh số tín hiệu hiện tại với baseline  
\- phát hiện anomaly  
\- xem xu hướng  
\- xem khu vực thường có nhiều tín hiệu  
\- hỗ trợ context cho AI

Không dùng lịch sử để tạo kết luận nhân quả nếu dữ liệu không chứng minh được.

Ví dụ:

Không nói:

"Khu vực này chắc chắn sẽ cháy."

Có thể nói:

"Khu vực này từng ghi nhận X tín hiệu trong khoảng thời gian tương tự."

\============================================================  
\#\# 39.24 — AI \+ ASSET MANAGEMENT  
\============================================================

Nếu app có:

Trạng thái tài sản  
Đơn vị  
Xe  
Thiết bị  
Nhân lực

thì phải liên kết với incident/task.

Ví dụ:

Incident  
↓  
Need verification  
↓  
Available asset  
↓  
Assignment  
↓  
Task  
↓  
Status  
↓  
Timeline

Không để Asset Management là một màn hình trang trí.

\============================================================  
\#\# 39.25 — COMMAND CENTER PHẢI LÀ NƠI TỔNG HỢP  
\============================================================

Command Center phải trả lời nhanh:

WHAT?  
Có chuyện gì?

WHERE?  
Ở đâu?

WHEN?  
Khi nào?

HOW SERIOUS?  
Mức độ nào?

WHY?  
Dựa trên dữ liệu nào?

WHAT NEXT?  
Cần làm gì tiếp?

STATUS?  
Đã xử lý đến đâu?

SOURCE?  
Nguồn nào?

DATA QUALITY?  
Dữ liệu có đáng tin/còn mới không?

Không biến Command Center thành dashboard KPI đơn thuần.

\============================================================  
\#\# 39.26 — MAP PHẢI LÀ "SPATIAL SOURCE OF TRUTH"  
\============================================================

Mọi entity có location phải có thể:

\- mở trên map  
\- highlight  
\- filter  
\- xem detail

Ví dụ:

Chatbot → signal  
→ Map

Event list → incident  
→ Map

Command → alert  
→ Map

What-if → scenario  
→ Map

Không tạo các map context độc lập.

\============================================================  
\#\# 39.27 — CROSS-FEATURE DEEP LINKING  
\============================================================

Tất cả chức năng quan trọng phải liên kết được.

Ví dụ:

Signal  
→ Event  
→ Incident  
→ AI Analysis  
→ Map  
→ Alert  
→ Task  
→ Asset

Một entity phải có "related information".

Detail page nên có:

Related signals  
Related incidents  
Related alerts  
AI assessment  
Weather context  
Timeline  
Actions

\============================================================  
\#\# 39.28 — TIMELINE  
\============================================================

Mỗi incident quan trọng phải có timeline.

Ví dụ:

22:03  
FIRMS signal detected

22:04  
Signal validated

22:06  
AI assessment generated

22:07  
Alert created

22:09  
Verification assigned

22:15  
Field verification pending

22:20  
Incident confirmed

Timeline phải được tạo từ actual state transitions.

Không hardcode timeline chỉ để demo đẹp.

\============================================================  
\#\# 39.29 — AUDIT TRAIL  
\============================================================

Các action quan trọng phải tạo audit event:

\- alert created  
\- alert acknowledged  
\- incident status changed  
\- assignment changed  
\- verification completed  
\- AI assessment generated  
\- scenario executed

Mỗi event:

actor  
timestamp  
action  
entity  
previous state  
new state

Nếu hệ thống chỉ DEMO:

có thể dùng simulated actor nhưng phải rõ DEMO.

\============================================================  
\#\# 39.30 — USER ACTION → SYSTEM CONSEQUENCE  
\============================================================

Mọi action phải có consequence.

Ví dụ:

\[Theo dõi\]  
→ signal watched  
→ watchlist cập nhật  
→ notification nếu có update

\[Xác minh\]  
→ tạo verification task  
→ incident status đổi  
→ timeline cập nhật

\[Acknowledge alert\]  
→ alert status đổi  
→ Command Center cập nhật

\[Resolve\]  
→ incident resolved  
→ active incident count giảm  
→ timeline cập nhật

\[Open AI analysis\]  
→ phân tích đúng entity

Không để button chỉ đổi màu hoặc mở modal trống.

\============================================================  
\#\# 39.31 — NOTIFICATION LOGIC  
\============================================================

Notification phải xuất phát từ event thực tế.

Không tạo notification giả mỗi lần refresh.

Phân biệt:

new  
read  
acknowledged  
resolved

Không gửi duplicate.

Ví dụ:

Một alert:  
→ chỉ tạo notification một lần.

Refresh:  
→ không tạo thêm.

\============================================================  
\#\# 39.32 — REALISTIC OPERATIONAL WORKFLOW  
\============================================================

Xây workflow mẫu thực tế:

STEP 1  
FIRMS signal arrives

STEP 2  
Validate coordinate/time/source

STEP 3  
Deduplicate/correlate

STEP 4  
Create signal

STEP 5  
Calculate assessment

STEP 6  
Determine whether alert threshold is met

STEP 7  
Create alert nếu đủ điều kiện

STEP 8  
Human verification workflow

STEP 9  
Incident created/confirmed nếu đủ điều kiện

STEP 10  
Assign response task

STEP 11  
Track

STEP 12  
Resolve

STEP 13  
Historical record

Tất cả module phải đọc cùng lifecycle này.

\============================================================  
\#\# 39.33 — NO ISOLATED FEATURES  
\============================================================

Audit toàn bộ menu hiện tại:

Eco Map  
Chỉ huy  
Event Intelligence  
What-if Lab  
Mô phỏng cháy 3D  
AI Assistant  
Asset Management  
Alerts  
Incidents

Với mỗi feature, phải trả lời:

"Feature này nhận input từ đâu?"

"Output của nó đi đâu?"

"Nó có ảnh hưởng feature nào khác?"

Nếu câu trả lời là:

"Không"

→ feature đó đang bị cô lập.

Phải tìm cách tích hợp thực tế hoặc loại bỏ UI không có giá trị.

\============================================================  
\#\# 39.34 — 3D FIRE SIMULATION  
\============================================================

Mô phỏng 3D không được là animation trang trí.

Nếu giữ lại:

Input:  
\- wind  
\- terrain  
\- vegetation/fuel  
\- humidity  
\- ignition point  
\- scenario parameters

Output:  
\- simulated spread  
\- affected area  
\- direction  
\- time progression

Phải ghi rõ:

SIMULATION

Không được gọi:

"Prediction"

nếu chỉ là visual simulation.

Nếu simulation dùng simplified model:  
→ documentation phải nói rõ assumptions.

\============================================================  
\#\# 39.35 — SIMULATION → WHAT-IF → AI  
\============================================================

Ba module phải liên kết:

What-if parameters  
↓  
Simulation  
↓  
AI/risk assessment  
↓  
Map  
↓  
Comparison

Ví dụ:

User:  
"Điều gì xảy ra nếu gió tăng?"

→ scenario tạo

→ simulation chạy

→ AI assessment cập nhật

→ map cập nhật

→ chatbot có thể giải thích

Đây là một workflow xuyên suốt.

\============================================================  
\#\# 39.36 — DATA PROVENANCE  
\============================================================

Mỗi dữ liệu quan trọng phải biết:

source  
timestamp  
processing step  
status

Ví dụ:

FIRMS  
↓  
ingested 22:03  
↓  
validate 22:03  
↓  
correlated 22:04  
↓  
AI assessed 22:05

Không cần hiển thị toàn bộ cho người dùng,  
nhưng phải tồn tại trong architecture/debug metadata nếu phù hợp.

\============================================================  
\#\# 39.37 — REAL-WORLD SOURCE ADAPTERS  
\============================================================

Nếu project có tích hợp dữ liệu thật:

Thiết kế adapter rõ ràng:

FIRMS adapter  
Weather adapter  
Map adapter  
AI adapter

Không để UI gọi API trực tiếp khắp nơi.

Architecture:

External Source  
↓  
Adapter  
↓  
Normalizer  
↓  
Domain Model  
↓  
Application State  
↓  
UI / AI / Chatbot

Điều này cho phép:

Demo data  
→ cùng schema

Real data  
→ cùng schema

Không phải viết lại toàn bộ app khi đổi source.

\============================================================  
\#\# 39.38 — DEMO DATA PHẢI CÓ TÍNH NHẤT QUÁN  
\============================================================

Nếu chưa thể dùng live data:

Tạo một DEMO DATASET duy nhất.

Dataset phải có:

\- timestamps hợp lý  
\- coordinates hợp lý  
\- relationships hợp lý  
\- statuses hợp lý  
\- weather hợp lý  
\- signals  
\- incidents  
\- alerts  
\- assets  
\- tasks

Không tạo mỗi màn hình một bộ mock riêng.

Ví dụ:

DEMO SIGNAL-001

phải xuất hiện nhất quán ở:

Map  
Events  
AI  
Chatbot  
Command  
Timeline

\============================================================  
\#\# 39.39 — DATA REALISM VALIDATION  
\============================================================

Thêm validation cho demo/real dataset:

\- coordinate nằm trong vùng hợp lý  
\- timestamp hợp lý  
\- severity hợp lý  
\- status transition hợp lệ  
\- incident có signal/source phù hợp  
\- alert có trigger  
\- task có target entity  
\- asset assignment không conflict nếu business rule cấm  
\- wind speed/unit hợp lệ  
\- weather values hợp lý  
\- risk score trong range

Nếu dataset không hợp lệ:  
→ fail validation.

Không để UI tự nuốt lỗi.

\============================================================  
\#\# 39.40 — CHATBOT SOURCE CITATION / TRACEABILITY  
\============================================================

Khi chatbot trả lời số liệu hoặc sự kiện:

nếu UI architecture cho phép, hiển thị nguồn:

Source:  
FIRMS  
Updated:  
22:10

hoặc:

Based on:  
3 signals · Weather · Wind

Người dùng phải có thể click:

\[Xem dữ liệu\]

→ mở entity tương ứng.

\============================================================  
\#\# 39.41 — CHATBOT KHÔNG ĐƯỢC TỰ ĐẶT BUSINESS RULE  
\============================================================

Ví dụ không cho LLM tự quyết:

"Điểm này là cấp IV."

Business engine phải quyết định.

LLM chỉ:

giải thích kết quả.

Tương tự:

"Incident này cần điều xe."

Nếu hệ thống có dispatch rule:  
→ engine quyết định.

LLM:  
→ trình bày recommendation dựa trên engine.

\============================================================  
\#\# 39.42 — AI ORCHESTRATION  
\============================================================

Xây một orchestration layer hợp lý:

User / Event  
↓  
Context Builder  
↓  
Domain Services  
├── Signal Service  
├── Incident Service  
├── Weather Service  
├── Risk Engine  
├── Alert Engine  
├── Asset Service  
└── Simulation Service  
↓  
AI Reasoning / LLM  
↓  
Structured Result  
↓  
Action / UI

LLM không được trực tiếp thay thế domain services.

\============================================================  
\#\# 39.43 — STRUCTURED AI OUTPUT  
\============================================================

AI output không nên chỉ là text.

Ưu tiên schema:

{  
  summary,  
  assessment,  
  confidence,  
  evidence\[\],  
  dataSources\[\],  
  limitations\[\],  
  recommendations\[\],  
  relatedEntityIds\[\],  
  actions\[\]  
}

Sau đó UI render schema.

Không parse text tự do để lấy:

risk  
severity  
incidentId

\============================================================  
\#\# 39.44 — AI CROSS-FEATURE REASONING  
\============================================================

AI phải có khả năng liên kết dữ liệu.

Ví dụ:

FIRMS:  
3 signals

Weather:  
dry

Wind:  
NE 18 km/h

Historical:  
above baseline

Incident:  
unverified

AI:

"Nhóm tín hiệu đang có nhiều yếu tố cần xác minh hơn bình thường."

Không được kết luận "chắc chắn cháy".

AI phải giải thích:

Evidence  
→ Interpretation  
→ Uncertainty  
→ Suggested next step

\============================================================  
\#\# 39.45 — PRACTICAL USER JOURNEYS  
\============================================================

Sau khi sửa, phải test ít nhất các journey:

\#\#\# JOURNEY A — phát hiện tín hiệu

FIRMS  
→ signal  
→ map  
→ AI assessment  
→ alert nếu đủ điều kiện  
→ verification  
→ incident

\#\#\# JOURNEY B — chỉ huy

Command Center  
→ thấy alert  
→ mở incident  
→ xem map  
→ xem AI  
→ xem weather  
→ assign task  
→ theo dõi timeline

\#\#\# JOURNEY C — chatbot

User:  
"Có gì đáng chú ý hiện tại?"

→ chatbot query current state  
→ tổng hợp alerts/signals/incidents  
→ đưa nguồn  
→ user click entity  
→ map mở

\#\#\# JOURNEY D — What-if

Signal  
→ What-if  
→ thay đổi wind  
→ simulation  
→ risk recalculation  
→ map comparison  
→ AI explanation

\#\#\# JOURNEY E — dữ liệu lỗi

FIRMS unavailable  
→ system degraded  
→ UI báo rõ  
→ AI không fake result  
→ chatbot biết data unavailable  
→ retry/reconnect

\#\#\# JOURNEY F — xác minh

Signal  
→ theo dõi  
→ tạo task  
→ task xuất hiện Command Center  
→ status thay đổi  
→ timeline cập nhật  
→ signal/incident cập nhật.

\============================================================  
\#\# 39.46 — PRACTICALITY TEST  
\============================================================

Với MỖI chức năng hiện có, hãy tự hỏi:

"Nếu tôi là người dùng thật, tôi sẽ dùng chức năng này để làm gì?"

Nếu không có câu trả lời rõ:

→ sửa chức năng  
→ tích hợp nó với workflow  
→ hoặc loại bỏ UI thừa.

Không giữ feature chỉ vì nó đã được code.

\============================================================  
\#\# 39.47 — REALISM OVER COMPLEXITY  
\============================================================

Không cần thêm 50 tính năng mới.

Ưu tiên:

ít chức năng hơn  
nhưng liên kết chặt  
và hoạt động logic.

Một workflow hoàn chỉnh:

Signal  
→ Assessment  
→ Alert  
→ Verification  
→ Incident  
→ Task  
→ Resolution

có giá trị hơn 10 dashboard card không có interaction.

\============================================================  
\#\# 39.48 — FINAL REAL-WORLD ACCEPTANCE CRITERIA  
\============================================================

PASS chỉ khi:

\[ \] Số liệu có nguồn hoặc được ghi rõ DEMO  
\[ \] Không hardcode KPI độc lập ở nhiều nơi  
\[ \] Có canonical domain data  
\[ \] Stable IDs xuyên suốt hệ thống  
\[ \] Signal/Alert/Incident được phân biệt  
\[ \] Event lifecycle hợp lý  
\[ \] AI dùng context thực tế  
\[ \] AI không hallucinate số liệu  
\[ \] Chatbot query app state  
\[ \] Chatbot trả lời đúng dữ liệu hiện tại  
\[ \] Chatbot biết data freshness  
\[ \] Chatbot biết LIVE/DEMO/OFFLINE  
\[ \] Chatbot có deep links/actions  
\[ \] AI Recommendation liên kết Event/Command/Map  
\[ \] What-if dùng cùng risk engine  
\[ \] Simulation dùng input thực tế  
\[ \] Weather được sử dụng xuyên feature  
\[ \] Historical data có mục đích  
\[ \] Asset có liên kết incident/task  
\[ \] Alerts có trigger  
\[ \] Incident có lifecycle  
\[ \] Timeline được tạo từ state transitions  
\[ \] Audit trail có logic  
\[ \] Map/List/AI/Chatbot dùng cùng entity IDs  
\[ \] Refresh không tạo duplicate  
\[ \] Offline không fake success  
\[ \] Data stale được biểu diễn đúng  
\[ \] Missing data ≠ low risk  
\[ \] AI unavailable ≠ risk zero  
\[ \] Demo data nhất quán toàn app  
\[ \] Không có feature cô lập vô nghĩa  
\[ \] Tất cả button/action có consequence  
\[ \] Các workflow chính chạy xuyên suốt

\============================================================  
\#\# 39.49 — FINAL QUESTION TRƯỚC KHI BÁO PASS  
\============================================================

Trước khi kết luận PASS, hãy tự kiểm tra:

"Nếu tôi xóa toàn bộ screenshot và chỉ nhìn vào workflow/data-flow,  
hệ thống này có còn hợp lý như một hệ thống giám sát cháy rừng thực tế không?"

Nếu câu trả lời là NO:

KHÔNG được báo PASS.

Tiếp tục sửa architecture / logic.

Mục tiêu không phải:

"trông giống hệ thống thật."

Mục tiêu là:

"logic bên trong phải có thể vận hành như một hệ thống thật,  
trong phạm vi dữ liệu, model và nguồn lực mà project thực sự có."

\============================================================  
\#\# 39.50 — QUAN TRỌNG: KHÔNG TUYÊN BỐ PRODUCTION-READY GIẢ  
\============================================================

Sau toàn bộ audit, phân loại rõ:

REAL  
→ dữ liệu/model/service thực tế đã tích hợp

DEMO  
→ dữ liệu mô phỏng

HEURISTIC  
→ rule-based logic

AI MODEL  
→ model thực sự

SIMULATION  
→ mô phỏng

FALLBACK  
→ dữ liệu thay thế

CHƯA IMPLEMENTED  
→ chưa có

Không dùng một chữ "AI" để che tất cả.

Không dùng một chữ "LIVE" để che data mock.

Không dùng một chữ "PREDICTION" để che simulation.

Không dùng "VERIFIED" nếu chưa có verification.

Đây là yêu cầu bắt buộc để hệ thống có tính minh bạch và có thể mở rộng sang dữ liệu thật sau này.  
22:03  
↓  
correlated 22:04  
↓  
AI assessed 22:05

Không cần hiển thị toàn bộ cho người dùng,  
nhưng phải tồn tại trong architecture/debug metadata nếu phù hợp.

\============================================================  
\#\# 39.37 — REAL-WORLD SOURCE ADAPTERS  
\============================================================

Nếu project có tích hợp dữ liệu thật:

Thiết kế adapter rõ ràng:

FIRMS adapter  
Weather adapter  
Map adapter  
AI adapter

Không để UI gọi API trực tiếp khắp nơi.

Architecture:

External Source  
↓  
Adapter  
↓  
Normalizer  
↓  
Domain Model  
↓  
Application State  
↓  
UI / AI / Chatbot

Điều này cho phép:

Demo data  
→ cùng schema

Real data  
→ cùng schema

Không phải viết lại toàn bộ app khi đổi source.

\============================================================  
\#\# 39.38 — DEMO DATA PHẢI CÓ TÍNH NHẤT QUÁN  
\============================================================

Nếu chưa thể dùng live data:

Tạo một DEMO DATASET duy nhất.

Dataset phải có:

\- timestamps hợp lý  
\- coordinates hợp lý  
\- relationships hợp lý  
\- statuses hợp lý  
\- weather hợp lý  
\- signals  
\- incidents  
\- alerts  
\- assets  
\- tasks

Không tạo mỗi màn hình một bộ mock riêng.

Ví dụ:

DEMO SIGNAL-001

phải xuất hiện nhất quán ở:

Map  
Events  
AI  
Chatbot  
Command  
Timeline

\============================================================  
\#\# 39.39 — DATA REALISM VALIDATION  
\============================================================

Thêm validation cho demo/real dataset:

\- coordinate nằm trong vùng hợp lý  
\- timestamp hợp lý  
\- severity hợp lý  
\- status transition hợp lệ  
\- incident có signal/source phù hợp  
\- alert có trigger  
\- task có target entity  
\- asset assignment không conflict nếu business rule cấm  
\- wind speed/unit hợp lệ  
\- weather values hợp lý  
\- risk score trong range

Nếu dataset không hợp lệ:  
→ fail validation.

Không để UI tự nuốt lỗi.

\============================================================  
\#\# 39.40 — CHATBOT SOURCE CITATION / TRACEABILITY  
\============================================================

Khi chatbot trả lời số liệu hoặc sự kiện:

nếu UI architecture cho phép, hiển thị nguồn:

Source:  
FIRMS  
Updated:  
22:10

hoặc:

Based on:  
3 signals · Weather · Wind

Người dùng phải có thể click:

\[Xem dữ liệu\]

→ mở entity tương ứng.

\============================================================  
\#\# 39.41 — CHATBOT KHÔNG ĐƯỢC TỰ ĐẶT BUSINESS RULE  
\============================================================

Ví dụ không cho LLM tự quyết:

"Điểm này là cấp IV."

Business engine phải quyết định.

LLM chỉ:

giải thích kết quả.

Tương tự:

"Incident này cần điều xe."

Nếu hệ thống có dispatch rule:  
→ engine quyết định.

LLM:  
→ trình bày recommendation dựa trên engine.

\============================================================  
\#\# 39.42 — AI ORCHESTRATION  
\============================================================

Xây một orchestration layer hợp lý:

User / Event  
↓  
Context Builder  
↓  
Domain Services  
├── Signal Service  
├── Incident Service  
├── Weather Service  
├── Risk Engine  
├── Alert Engine  
├── Asset Service  
└── Simulation Service  
↓  
AI Reasoning / LLM  
↓  
Structured Result  
↓  
Action / UI

LLM không được trực tiếp thay thế domain services.

\============================================================  
\#\# 39.43 — STRUCTURED AI OUTPUT  
\============================================================

AI output không nên chỉ là text.

Ưu tiên schema:

{  
  summary,  
  assessment,  
  confidence,  
  evidence\[\],  
  dataSources\[\],  
  limitations\[\],  
  recommendations\[\],  
  relatedEntityIds\[\],  
  actions\[\]  
}

Sau đó UI render schema.

Không parse text tự do để lấy:

risk  
severity  
incidentId

\============================================================  
\#\# 39.44 — AI CROSS-FEATURE REASONING  
\============================================================

AI phải có khả năng liên kết dữ liệu.

Ví dụ:

FIRMS:  
3 signals

Weather:  
dry

Wind:  
NE 18 km/h

Historical:  
above baseline

Incident:  
unverified

AI:

"Nhóm tín hiệu đang có nhiều yếu tố cần xác minh hơn bình thường."

Không được kết luận "chắc chắn cháy".

AI phải giải thích:

Evidence  
→ Interpretation  
→ Uncertainty  
→ Suggested next step

\============================================================  
\#\# 39.45 — PRACTICAL USER JOURNEYS  
\============================================================

Sau khi sửa, phải test ít nhất các journey:

\#\#\# JOURNEY A — phát hiện tín hiệu

FIRMS  
→ signal  
→ map  
→ AI assessment  
→ alert nếu đủ điều kiện  
→ verification  
→ incident

\#\#\# JOURNEY B — chỉ huy

Command Center  
→ thấy alert  
→ mở incident  
→ xem map  
→ xem AI  
→ xem weather  
→ assign task  
→ theo dõi timeline

\#\#\# JOURNEY C — chatbot

User:  
"Có gì đáng chú ý hiện tại?"

→ chatbot query current state  
→ tổng hợp alerts/signals/incidents  
→ đưa nguồn  
→ user click entity  
→ map mở

\#\#\# JOURNEY D — What-if

Signal  
→ What-if  
→ thay đổi wind  
→ simulation  
→ risk recalculation  
→ map comparison  
→ AI explanation

\#\#\# JOURNEY E — dữ liệu lỗi

FIRMS unavailable  
→ system degraded  
→ UI báo rõ  
→ AI không fake result  
→ chatbot biết data unavailable  
→ retry/reconnect

\#\#\# JOURNEY F — xác minh

Signal  
→ theo dõi  
→ tạo task  
→ task xuất hiện Command Center  
→ status thay đổi  
→ timeline cập nhật  
→ signal/incident cập nhật.

\============================================================  
\#\# 39.46 — PRACTICALITY TEST  
\============================================================

Với MỖI chức năng hiện có, hãy tự hỏi:

"Nếu tôi là người dùng thật, tôi sẽ dùng chức năng này để làm gì?"

Nếu không có câu trả lời rõ:

→ sửa chức năng  
→ tích hợp nó với workflow  
→ hoặc loại bỏ UI thừa.

Không giữ feature chỉ vì nó đã được code.

\============================================================  
\#\# 39.47 — REALISM OVER COMPLEXITY  
\============================================================

Không cần thêm 50 tính năng mới.

Ưu tiên:

ít chức năng hơn  
nhưng liên kết chặt  
và hoạt động logic.

Một workflow hoàn chỉnh:

Signal  
→ Assessment  
→ Alert  
→ Verification  
→ Incident  
→ Task  
→ Resolution

có giá trị hơn 10 dashboard card không có interaction.

\============================================================  
\#\# 39.48 — FINAL REAL-WORLD ACCEPTANCE CRITERIA  
\============================================================

PASS chỉ khi:

\[ \] Số liệu có nguồn hoặc được ghi rõ DEMO  
\[ \] Không hardcode KPI độc lập ở nhiều nơi  
\[ \] Có canonical domain data  
\[ \] Stable IDs xuyên suốt hệ thống  
\[ \] Signal/Alert/Incident được phân biệt  
\[ \] Event lifecycle hợp lý  
\[ \] AI dùng context thực tế  
\[ \] AI không hallucinate số liệu  
\[ \] Chatbot query app state  
\[ \] Chatbot trả lời đúng dữ liệu hiện tại  
\[ \] Chatbot biết data freshness  
\[ \] Chatbot biết LIVE/DEMO/OFFLINE  
\[ \] Chatbot có deep links/actions  
\[ \] AI Recommendation liên kết Event/Command/Map  
\[ \] What-if dùng cùng risk engine  
\[ \] Simulation dùng input thực tế  
\[ \] Weather được sử dụng xuyên feature  
\[ \] Historical data có mục đích  
\[ \] Asset có liên kết incident/task  
\[ \] Alerts có trigger  
\[ \] Incident có lifecycle  
\[ \] Timeline được tạo từ state transitions  
\[ \] Audit trail có logic  
\[ \] Map/List/AI/Chatbot dùng cùng entity IDs  
\[ \] Refresh không tạo duplicate  
\[ \] Offline không fake success  
\[ \] Data stale được biểu diễn đúng  
\[ \] Missing data ≠ low risk  
\[ \] AI unavailable ≠ risk zero  
\[ \] Demo data nhất quán toàn app  
\[ \] Không có feature cô lập vô nghĩa  
\[ \] Tất cả button/action có consequence  
\[ \] Các workflow chính chạy xuyên suốt

\============================================================  
\#\# 39.49 — FINAL QUESTION TRƯỚC KHI BÁO PASS  
\============================================================

Trước khi kết luận PASS, hãy tự kiểm tra:

"Nếu tôi xóa toàn bộ screenshot và chỉ nhìn vào workflow/data-flow,  
hệ thống này có còn hợp lý như một hệ thống giám sát cháy rừng thực tế không?"

Nếu câu trả lời là NO:

KHÔNG được báo PASS.

Tiếp tục sửa architecture / logic.

Mục tiêu không phải:

"trông giống hệ thống thật."

Mục tiêu là:

"logic bên trong phải có thể vận hành như một hệ thống thật,  
trong phạm vi dữ liệu, model và nguồn lực mà project thực sự có."

\============================================================  
\#\# 39.50 — QUAN TRỌNG: KHÔNG TUYÊN BỐ PRODUCTION-READY GIẢ  
\============================================================

Sau toàn bộ audit, phân loại rõ:

REAL  
→ dữ liệu/model/service thực tế đã tích hợp

DEMO  
→ dữ liệu mô phỏng

HEURISTIC  
→ rule-based logic

AI MODEL  
→ model thực sự

SIMULATION  
→ mô phỏng

FALLBACK  
→ dữ liệu thay thế

CHƯA IMPLEMENTED  
→ chưa có

Không dùng một chữ "AI" để che tất cả.

Không dùng một chữ "LIVE" để che data mock.

Không dùng một chữ "PREDICTION" để che simulation.

Không dùng "VERIFIED" nếu chưa có verification.

Đây là yêu cầu bắt buộc để hệ thống có tính minh bạch và có thể mở rộng sang dữ liệu thật sau này.  
\============================================================  
\#\# 41\. NON-NEGOTIABLE — GIỮ NGUYÊN NỀN TẢNG HIỆN TẠI, CHỈ FIX \+ NÂNG CẤP  
\============================================================

ĐÂY KHÔNG PHẢI LÀ YÊU CẦU REBUILD PROJECT.

ĐÂY LÀ:

EXISTING PRODUCT  
        ↓  
BUG FIX  
        ↓  
LOGIC FIX  
        ↓  
DATA CONSISTENCY  
        ↓  
AI IMPROVEMENT  
        ↓  
UX IMPROVEMENT  
        ↓  
INTEGRATION  
        ↓  
POLISH

Phải giữ lại sản phẩm hiện tại làm nền tảng.

\------------------------------------------------------------  
\#\# 41.1 — KHÔNG REWRITE TOÀN BỘ  
\------------------------------------------------------------

TUYỆT ĐỐI KHÔNG:

\- rewrite toàn bộ project  
\- tạo project mới  
\- thay framework  
\- thay router chỉ vì thích framework khác  
\- thay state management nếu hiện tại vẫn dùng được  
\- thay map engine nếu hiện tại đáp ứng được  
\- thay toàn bộ design system  
\- xóa các page hiện có  
\- xóa feature hiện có  
\- xây lại từ zero  
\- tạo một app mới có giao diện tương tự

Không được biến task:

"fix \+ upgrade"

thành:

"rebuild".

\------------------------------------------------------------  
\#\# 41.2 — GIỮ LẠI NHỮNG GÌ ĐANG HOẠT ĐỘNG  
\------------------------------------------------------------

Trước khi sửa:

AUDIT

và phân loại:

KEEP  
→ đang hoạt động tốt, giữ nguyên

FIX  
→ có bug, sửa nguyên nhân

IMPROVE  
→ hoạt động nhưng UX/logic chưa tốt, nâng cấp

INTEGRATE  
→ đang tồn tại nhưng bị cô lập, kết nối với module khác

REFACTOR  
→ code khó bảo trì hoặc duplicate, refactor có kiểm soát

REPLACE  
→ chỉ thay khi implementation hiện tại thực sự không thể đáp ứng yêu cầu

Không được REPLACE chỉ vì:

"có cách code đẹp hơn".

\------------------------------------------------------------  
\#\# 41.3 — PRESERVE EXISTING FEATURES  
\------------------------------------------------------------

Các phần hiện có phải được giữ làm nền tảng, bao gồm nếu đang tồn tại:

\- Eco Map  
\- Command Center  
\- Event Intelligence  
\- What-if Lab  
\- 3D Fire Simulation  
\- AI Assistant  
\- FIRMS data  
\- Fire prediction  
\- AI Vision / Detection  
\- Alerts  
\- Incidents  
\- Assets  
\- Weather  
\- Wind  
\- Search  
\- Sidebar  
\- Header  
\- Dashboard  
\- các route hiện tại  
\- các API/service hiện tại  
\- các components hiện tại

Không được xóa feature chỉ vì chưa hoàn thiện.

Ưu tiên:

feature hiện tại  
\+  
fix  
\+  
upgrade  
\+  
connect

\------------------------------------------------------------  
\#\# 41.4 — PRESERVE ROUTING  
\------------------------------------------------------------

Giữ nguyên route hiện tại nếu không có lý do bắt buộc.

Đặc biệt:

/  
/command  
/events

phải tiếp tục hoạt động.

Nếu cần thay đổi route:

chỉ thay khi thực sự cần thiết  
và phải đảm bảo backward compatibility.

\------------------------------------------------------------  
\#\# 41.5 — PRESERVE VISUAL IDENTITY  
\------------------------------------------------------------

Không thiết kế lại thương hiệu từ đầu.

Giữ:

\- GIALAI EcoChain identity  
\- logo  
\- màu chủ đạo  
\- bản đồ  
\- visual language  
\- sidebar concept  
\- header concept  
\- card system  
\- overall layout

Nhưng được:

\- sửa spacing  
\- sửa typography  
\- sửa hierarchy  
\- sửa alignment  
\- sửa contrast  
\- sửa responsive  
\- giảm visual noise  
\- sửa states  
\- nâng cấp interaction  
\- nâng cấp accessibility

Mục tiêu:

"same product, significantly better"

KHÔNG:

"different product".

\------------------------------------------------------------  
\#\# 41.6 — PRESERVE EXISTING DATA CONTRACTS  
\------------------------------------------------------------

Không tự ý thay đổi:

API response  
API request  
database schema  
field names  
IDs  
data format

nếu không cần thiết.

Nếu cần normalize:

tạo adapter/mapper.

Ví dụ:

Existing API  
↓  
Adapter  
↓  
Canonical domain model  
↓  
Existing UI

Không phá API chỉ để làm frontend dễ code hơn.

\------------------------------------------------------------  
\#\# 41.7 — PRESERVE EXISTING COMPONENTS WHEN POSSIBLE  
\------------------------------------------------------------

Trước khi tạo component mới:

tìm component hiện có.

Nếu component hiện tại có thể nâng cấp:

→ sửa component đó.

Không tạo:

NewCard.tsx

chỉ vì:

ExistingCard.tsx

cần thêm loading state.

Ưu tiên:

ExistingCard  
\+  
loading state  
\+  
error state  
\+  
empty state  
\+  
better UX

\------------------------------------------------------------  
\#\# 41.8 — PRESERVE EXISTING LOGIC IF CORRECT  
\------------------------------------------------------------

Không thay algorithm chỉ vì muốn viết lại.

Nếu logic đúng:

KEEP.

Nếu logic đúng nhưng thiếu edge cases:

EXTEND.

Nếu logic sai:

FIX ROOT CAUSE.

Nếu logic không thể đáp ứng yêu cầu thực tế:

REFACTOR / REPLACE có kiểm soát.

\------------------------------------------------------------  
\#\# 41.9 — BACKWARD COMPATIBILITY  
\------------------------------------------------------------

Sau mỗi thay đổi:

existing feature phải tiếp tục hoạt động.

Test:

\- existing route  
\- existing interaction  
\- existing data  
\- existing API  
\- existing map  
\- existing filters  
\- existing search  
\- existing AI panel  
\- existing chatbot  
\- existing simulation

Không chấp nhận:

"feature cũ hỏng nhưng feature mới đẹp hơn."

\------------------------------------------------------------  
\#\# 41.10 — NO FEATURE REMOVAL WITHOUT JUSTIFICATION  
\------------------------------------------------------------

Không được xóa:

button  
page  
component  
API  
data field  
feature

chỉ vì:

"không cần thiết".

Nếu thấy feature hiện tại chưa có giá trị:

→ tìm cách tích hợp nó vào workflow thực tế.

Chỉ xóa khi:

\- duplicate hoàn toàn  
\- gây lỗi nghiêm trọng  
\- không thể sử dụng  
\- hoặc có lý do kiến trúc rõ ràng

và phải báo cáo.

\------------------------------------------------------------  
\#\# 41.11 — INCREMENTAL DEVELOPMENT  
\------------------------------------------------------------

Làm theo incremental upgrade:

STEP 1  
Backup/current baseline

STEP 2  
Audit

STEP 3  
Fix P0 bugs

STEP 4  
Fix P1 logic

STEP 5  
Fix AI

STEP 6  
Connect existing features

STEP 7  
Improve UX

STEP 8  
Improve responsive

STEP 9  
Polish visual

STEP 10  
Regression test

Không làm:

"delete old → generate new".

\------------------------------------------------------------  
\#\# 41.12 — DIFF-ORIENTED THINKING  
\------------------------------------------------------------

Mỗi thay đổi phải trả lời:

WHAT EXISTED?  
→ cái gì đang có?

WHAT IS WRONG?  
→ lỗi gì?

WHAT CHANGES?  
→ sửa gì?

WHAT IS PRESERVED?  
→ giữ gì?

WHY?  
→ tại sao?

REGRESSION RISK?  
→ có nguy cơ phá gì?

Nếu không cần thay đổi:  
→ đừng thay đổi.

\------------------------------------------------------------  
\#\# 41.13 — MINIMAL CHANGE, MAXIMUM IMPACT  
\------------------------------------------------------------

Ưu tiên:

smallest safe change  
→ giải quyết root cause  
→ giữ compatibility

Không ưu tiên:

largest rewrite.

Ví dụ:

Sai:

rewrite Event Intelligence.

Đúng:

giữ Event Intelligence  
→ sửa data loading state  
→ sửa shared data source  
→ kết nối list/map  
→ thêm error/empty state  
→ cải thiện UX.

\------------------------------------------------------------  
\#\# 41.14 — EXISTING DEMO DATA  
\------------------------------------------------------------

Nếu project hiện tại có DEMO DATA:

KHÔNG xóa ngay.

Audit nó.

Nếu mock đang:

\- hardcode rời rạc  
\- không nhất quán  
\- số liệu phi thực tế

→ normalize lại thành một dataset có quan hệ.

Giữ data structure nếu có thể.

Mục tiêu:

OLD DEMO DATA  
→ CLEAN  
→ NORMALIZE  
→ RELATE  
→ VALIDATE

Không:

DELETE  
→ CREATE RANDOM NEW DATA.

\------------------------------------------------------------  
\#\# 41.15 — EXISTING AI  
\------------------------------------------------------------

Nếu hiện tại đã có AI:

KHÔNG xóa AI rồi tạo AI mới.

Audit:

\- AI input  
\- AI context  
\- AI output  
\- prompt  
\- model  
\- fallback  
\- state  
\- error handling  
\- confidence  
\- recommendation

Sau đó:

CURRENT AI  
→ fix hallucination  
→ improve grounding  
→ improve context  
→ connect domain data  
→ improve output schema  
→ improve UX

Nếu hiện tại chỉ là heuristic/demo:

giữ lại làm nền tảng,  
nhưng gắn rõ:

DEMO / HEURISTIC

và thiết kế architecture để sau này thay bằng model thật mà không phải viết lại UI.

\------------------------------------------------------------  
\#\# 41.16 — EXISTING CHATBOT  
\------------------------------------------------------------

Không thay chatbot bằng một chatbot hoàn toàn mới.

Giữ:

\- chat UI  
\- history nếu có  
\- layout  
\- assistant entry point

Nâng cấp backend/context:

Current App State  
↓  
Context Builder  
↓  
Existing Chatbot  
↓  
Grounded Response  
↓  
Actions / Deep Links

Chatbot phải trở nên chính xác hơn,  
không phải chỉ nói nhiều hơn.

\------------------------------------------------------------  
\#\# 41.17 — EXISTING MAP  
\------------------------------------------------------------

Không thay map engine nếu không cần.

Giữ:

\- basemap  
\- zoom  
\- controls  
\- marker system  
\- existing layers

Nâng cấp:

\- clustering  
\- selection  
\- list sync  
\- filtering  
\- detail  
\- performance  
\- loading  
\- error  
\- data source state

\------------------------------------------------------------  
\#\# 41.18 — EXISTING 3D / WHAT-IF  
\------------------------------------------------------------

Không xóa simulation hoặc What-if Lab.

Giữ làm nền tảng.

Nâng cấp bằng cách kết nối:

existing scenario inputs  
→ existing simulation  
→ existing AI/risk logic  
→ map  
→ comparison

Không tạo một simulation độc lập khác.

\------------------------------------------------------------  
\#\# 41.19 — EXISTING DESIGN  
\------------------------------------------------------------

Không thay đổi toàn bộ visual language.

Nếu một card hiện tại:

đẹp \+ đúng \+ usable

→ KEEP.

Nếu:

đẹp nhưng thiếu loading/error

→ EXTEND.

Nếu:

layout tốt nhưng spacing sai

→ POLISH.

Nếu:

UX sai

→ REDESIGN component đó, không redesign toàn app.

\------------------------------------------------------------  
\#\# 41.20 — DO NOT CREATE TECHNICAL DEBT TO PASS DEMO  
\------------------------------------------------------------

Không được giải quyết nhanh bằng:

\- fake timeout  
\- random data  
\- hardcoded AI result  
\- duplicate state  
\- duplicate API  
\- global mutable hacks  
\- giant component  
\- hidden errors  
\- magic numbers  
\- fake loading  
\- fake realtime  
\- fake confidence

Chúng có thể làm screenshot đẹp hơn nhưng sẽ phá tính thực tế.

\------------------------------------------------------------  
\#\# 41.21 — BEFORE / AFTER MINDSET  
\------------------------------------------------------------

Mục tiêu:

BEFORE  
→ Existing GIALAI EcoChain

AFTER  
→ Same GIALAI EcoChain  
   \+ fewer bugs  
   \+ correct logic  
   \+ realistic data  
   \+ grounded AI  
   \+ useful chatbot  
   \+ connected workflows  
   \+ better UX  
   \+ better reliability  
   \+ better performance

Không phải:

BEFORE  
→ GIALAI EcoChain

AFTER  
→ New application unrelated to original implementation.

\------------------------------------------------------------  
\#\# 41.22 — REGRESSION GATE  
\------------------------------------------------------------

Sau mỗi major change:

chạy existing tests.

Nếu test cũ fail:

KHÔNG sửa test chỉ để pass.

Tìm nguyên nhân regression.

Build phải tiếp tục pass.

Routes phải tiếp tục hoạt động.

Existing feature phải tiếp tục accessible.

\------------------------------------------------------------  
\#\# 41.23 — FINAL REPORT BẮT BUỘC  
\------------------------------------------------------------

Cuối cùng báo cáo:

\#\#\# PRESERVED  
Các phần cũ được giữ nguyên:  
\- ...

\#\#\# FIXED  
Các lỗi được sửa:  
\- ...

\#\#\# UPGRADED  
Các phần được nâng cấp:  
\- ...

\#\#\# INTEGRATED  
Các phần cũ được liên kết với nhau:  
\- ...

\#\#\# REFACTORED  
Các phần được refactor:  
\- ...

\#\#\# NOT CHANGED  
Các phần cố tình không thay đổi vì đang hoạt động đúng:  
\- ...

\#\#\# REMOVED  
Nếu có bất kỳ thứ gì bị xóa:  
\- cái gì  
\- lý do  
\- tác động

Nếu không xóa:  
"Không xóa feature hiện có."

\#\#\# REGRESSION  
\- Existing routes: PASS/FAIL  
\- Existing tests: PASS/FAIL  
\- Existing features: PASS/FAIL  
\- Build: PASS/FAIL

\============================================================  
\#\# 41.24 — GOLDEN RULE  
\============================================================

GIỮ CÁI ĐANG TỐT.

SỬA CÁI ĐANG SAI.

NÂNG CẤP CÁI ĐANG YẾU.

KẾT NỐI CÁI ĐANG BỊ CÔ LẬP.

KHÔNG REBUILD KHI KHÔNG CẦN.

KHÔNG XÓA CHỈ ĐỂ VIẾT LẠI.

KHÔNG THÊM FEATURE CHỈ ĐỂ CÓ THÊM FEATURE.

Mọi thay đổi phải làm GIALAI EcoChain hiện tại:

ổn định hơn  
thực tế hơn  
thông minh hơn  
dễ sử dụng hơn  
liên kết hơn

nhưng vẫn là CHÍNH SẢN PHẨM HIỆN TẠI.  
\============================================================  
