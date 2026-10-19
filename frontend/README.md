# Frontend Angular

Xem [README gốc](../README.md) để chạy cả hệ thống và cấu hình cloud.

- `npm ci`: cài dependency theo lockfile.
- `npm start`: localhost:4200, proxy `/api/**` tới backend cổng 8080.
- `npm test -- --watch=false`: unit test.
- `npm run build`: prerender ra `dist/exe-web/browser`.

`src/app/core` chứa API client; `features` chứa các khu vực ứng dụng; `shared` chứa component chung. Route dùng lazy loading. Development gọi `/api`; production cần đặt URL trong `src/environments/environment.ts`. Không đặt secrets trong frontend.
