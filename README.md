# GIALAI EcoChain — Hệ thống điều hành cảnh báo sớm cháy rừng Gia Lai

> **NHÌN → HIỂU → DỰ ĐOÁN → MÔ PHỎNG → HÀNH ĐỘNG → XÁC MINH.**
> Giao diện hoàn toàn tiếng Việt. Mọi con số đều tính từ dữ liệu đầu vào;
> thiếu dữ liệu thì ghi rõ, không bịa số.

## 1. Tổng quan

GIALAI EcoChain là hệ điều hành dữ liệu môi trường cấp tỉnh, chuyên về
**cảnh báo sớm cháy rừng Gia Lai**: điểm nóng vệ tinh NASA FIRMS, thời tiết
Open-Meteo, NDVI Sentinel-2, công thức nguy cơ duy nhất, bản đồ nhiệt, phòng
thí nghiệm giả định, mô phỏng lan lửa, báo cáo/xác minh cộng đồng, nhiệm vụ
thực địa khép vòng, nhật ký kiểm toán.

## 2. Kiến trúc

```
Vệ tinh/thời tiết/cộng đồng (lớp lấy dữ liệu, có dự phòng giả lập)
        ↓
Chuẩn hóa → Fire Risk Engine (services/fire_risk.compute_score)
        ↓
Hiểu biết không gian (lưới nguy cơ, bản đồ MapLibre/3D)
        ↓
Giải thích AI (có dự phòng cố định ghi rõ, không giả vờ LLM chạy)
        ↓
Giao diện (trung tâm chỉ huy, bản đồ, phòng thí nghiệm, hiện trường)
        ↓
Con người phê duyệt (nhiệm vụ, xác minh) → nhật ký kiểm toán
```

- **Một nguồn sự thật điểm nguy cơ:** `backend/app/services/fire_risk.py::compute_score`
  (thuần túy, tất định, chuẩn hóa lại trọng số khi thiếu yếu tố).
- **Không gọi API ngoài lung tung từ UI:** frontend chỉ gọi backend qua
  `frontend/src/services/api.ts` (`VITE_API_BASE`).

## 3. Công nghệ

- Backend: FastAPI + SQLAlchemy + Alembic (SQLite/Postgres), Pydantic.
- Frontend: React + Vite + TypeScript, MapLibre GL, Three.js (mô phỏng 3D),
  Zustand (phạm vi chia sẻ), Vitest.
- Dữ liệu: NASA FIRMS, Open-Meteo (không cần key), Sentinel-2 qua GEE
  (cần key), Terrarium DEM (lát cắt ngoài, chỉ hiển thị).

## 4. Chạy local

```bash
cd backend
cp .env.example .env        # điền key nếu có, không thì chạy chế độ giả lập
python -m alembic upgrade head
python -m uvicorn app.main:app --reload   # http://127.0.0.1:8000

cd frontend
cp .env.example .env        # VITE_API_BASE=http://127.0.0.1:8000
npm install
npm run dev                 # http://localhost:5173
```

## 5. Biến môi trường

Xem `backend/.env.example` (đầy đủ, không chứa giá trị thật) và
`frontend/.env.example`. Không bao giờ commit `.env`.

| Biến | Dùng để | Bắt buộc? |
|---|---|---|
| `DATABASE_URL` | Cơ sở dữ liệu (mặc định SQLite file) | Không |
| `SECRET_KEY` | Ký JWT | Production có |
| `FIRMS_MAP_KEY` | Điểm nóng NASA FIRMS trực tiếp | Không (thiếu → nhãn giả lập) |
| `GEE_PROJECT_ID` / `GEE_SERVICE_ACCOUNT` / `GEE_PRIVATE_KEY` | NDVI Sentinel-2 | Không (thiếu → nhãn giả lập) |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Diễn giải AI | Không (thiếu → dự phòng cố định) |
| `SENTINELHUB_*` / `COPERNICUS_*` | Ảnh vệ tinh | Không |
| `VITE_API_BASE` | Frontend trỏ backend | Production có |

## 6. Chế độ giả lập (không cần key)

Không key vẫn chạy: điểm lưới/bản đồ để trống hoặc nhãn **GIẢ LẬP**,
backtest dùng nhãn cháy mô phỏng (tất định, có ghi rõ), AI dùng dự phòng
cố định. Khung vàng **DỮ LIỆU GIẢ LẬP** hiện ở mọi nơi dùng số mô phỏng.

## 7. Chế độ trực tiếp

Đủ key FIRMS + Open-Meteo (miễn phí) là có luồng trực tiếp: điểm nóng,
thời tiết, điểm nguy cơ, cảnh báo. GEE và LLM là tùy chọn nâng cao.

## 8. Cấu hình API

Tất cả endpoint dưới `/api` (xem `/docs` khi chạy backend):

- `POST /fire-risk/calculate` — tính điểm từ đầu vào thử
- `GET /fire-risk/backtest?start=&end=&threshold=` — kiểm chứng (202 khi tính ngoài luồng)
- `GET /fire-risk/grid?bbox=&cell_km=&scenario=` — lưới GeoJSON
- `GET /fire-risk/config` — trọng số + ngưỡng (một nơi duy nhất)
- `POST /citizen/fire-report`, `.../confirm`, `POST /evidence`
- `POST/GET/PATCH /missions`, `POST /missions/{id}/result`, `GET /missions-stats/summary`
- `GET /villages/fire-alert`, `/fire/hotspots`, `/alerts-unified`, `/fire/warnings`

## 9. Engine nguy cơ cháy

Đầu vào: nhiệt độ, ẩm, mưa, gió, NDVI/NDMI/NBR, dốc, điểm FIRMS, lịch sử/
cộng đồng. Trọng số trong `backend/app/services/fire_risk_config.py`,
ngưỡng I..V: 20/40/60/80 (`GET /fire-risk/config`).
Thiếu yếu tố → loại khỏi công thức + chuẩn hóa lại trọng số + hiện
`data_completeness` và danh sách thiếu.

> Chỉ số tham khảo, trọng số chưa hiệu chuẩn (xem backtest).

## 10. Kiến trúc AI

`POST /ai/pccc/synthesis` nhận dữ liệu nguy cơ có cấu trúc → LLM tổng hợp
(Gemini/Groq). Thiếu key → dự phòng cố định **ghi rõ** (không giả vờ AI
chạy). System prompt yêu cầu: không bịa số, không biến điểm thành xác suất
cháy, thiếu dữ liệu thì nói rõ, phân biệt trực tiếp/giả lập.

## 11. Bản đồ 3D

`/ban-do-3d`: MapLibre + địa hình Terrarium (nghiêng/xoay), lớp nguy cơ,
điểm nóng, báo cáo cộng đồng. Địa hình chỉ phục vụ nhìn/xoay, không thay số
liệu. Mô phỏng lan lửa 3D đầy đủ ở `/firesim` (Three.js).

## 12. Phòng thí nghiệm giả định

`/phong-thi-nghiem`: thanh trượt nhiệt/ẩm/ngày khô/gió (debounce 250ms),
so với gốc (+/− điểm), nhãn **THỬ NGHIỆM — không phải dự báo**, công thức
đang dùng hiện công khai.

## 13. Mô phỏng lan lửa

`/firesim`: ellipse theo gió/dốc, mốc +1/+3/+6 giờ, xã ảnh hưởng, kế hoạch
ứng phó. Ghi rõ **mô hình heuristic mô phỏng**, không phải dự báo đã kiểm định.

## 14. Con người trong vòng lặp

Nhiệm vụ MỚI → ĐÃ GIAO → ĐANG KIỂM TRA → XONG (chỉ admin/kiểm lâm tạo,
backend kiểm tra quyền). Kết quả CONFIRMED_FIRE tạo báo cáo đã xác minh +
cảnh báo; FALSE_ALARM vào thống kê. Mọi bước ghi nhật ký kiểm toán.

## 15. Nhật ký kiểm toán

`/nhat-ky` (đọc từ `/forest/audit`): ai làm gì, ở đâu, điểm bao nhiêu,
chế độ dữ liệu nào. Nhiệm vụ nào cũng ghi lại tạo/đổi trạng thái/kết quả.

## 16. Hạn chế (đã biết)

- Trọng số công thức chưa hiệu chuẩn trên dữ liệu Gia Lai (backtest là bước đầu).
- FIRMS NRT chỉ bao phủ ~10 ngày gần nhất; backtest xa hơn dùng nhãn mô phỏng.
- Serverless (Vercel): SQLite `/tmp` mất dữ liệu khi redeploy; production thật nên dùng Postgres + chạy `alembic upgrade head`.
- oxlint (`npm run lint`) hỏng binding trên Windows của máy dev (lỗi môi trường,
  không liên quan code) — kiểm tra bằng `tsc` trong `npm run build`.
- 2 test backend fail khi máy có key thật (test giả định môi trường không key):
  `test_synthesis_fallback_labeled_demo`, `test_no_creds_no_crash`.

## 17. Phát triển tiếp

- Hiệu chuẩn trọng số bằng backtest nhiều mùa cháy + type annotation lịch sử.
- Vai trò kiểm lâm viên trong UI đăng ký (hiện gán trực tiếp trong DB).
- Postgres production + Alembic tự chạy khi deploy.
- Ảnh vệ tinh Sentinel Hub trực tiếp (đã có khung, thiếu key).

## 18. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| UI báo ngoại tuyến | Kiểm tra backend `:8000/api/ping`, `VITE_API_BASE` |
| Ô lưới/bản đồ trống | Thiếu key hoặc API ngoài sập — khung ghi rõ, không phải lỗi UI |
| `/missions` 500 `no such column` | DB cũ: `python -m alembic upgrade head` (migration tự đổi tên bảng legacy) |
| Build lỗi TS | `npm run build` (tsc) báo dòng cụ thể — sửa, không tắt kiểm tra |
| Test cần mạng | backtest/grid gọi Open-Meteo/FIRMS thật; mất mạng thì test đó fail, code vẫn đúng |
