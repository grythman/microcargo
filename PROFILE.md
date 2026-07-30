# Cargo Profile Хэсэг - Бүрэн Гарын Авлага

## Захиалагч (Customer)

### Topbar Profile Button
- Баруун дээд булан: аватар + нэр
- Дарвал → Профайл хуудас нээгдэнэ

### Профайл Хуудас

#### 1. Зураг (Avatar)
- **Оруулах**: "Зураг оруулах" товч → jpg/png/webp/gif (2MB max)
- **Устгах**: "Устгах" товч
- Зураг байхгүй үед анхны үсэг харагдана

#### 2. Хувийн Мэдээлэл
- **Утас**: зөвхөн харагдах (readonly)
- **Нэр**: засах боломжтой
- **Хаяг**: хот/дүүрэг/хороо
- **Тэмдэглэл**: хүргэлтийн тэмдэглэл

#### 3. Нууц Үг Солих
- Хуучин нууц үг
- Шинэ нууц үг (4+ тэмдэгт)
- Давтан оруулах

### Excel Export
Захиалга хуудас дээр "Excel татах" → өөрийн захиалгууд .xlsx файл татагдана

---

## Админ

### Topbar Profile
- Баруун дээд булан: "А" аватар + админ нэр харагдана

### Excel Export
- Захиалга жагсаалт дээр "Excel татах"
- Хайлт хийсэн бол шүүсэн захиалгууд, үгүй бол бүгд

---

## API Endpoints

### Customer
- `GET /api/my/profile` - Профайл харах
- `PUT /api/my/profile` - Нэр/хаяг/тэмдэглэл засах
- `POST /api/my/avatar` - Зураг оруулах (multipart/form-data)
- `DELETE /api/my/avatar` - Зураг устгах
- `PUT /api/my/password` - Нууц үг солих
- `GET /api/my/orders/export` - Excel татах

### Admin
- `GET /api/admin/orders/export?phone=` - Excel татах

---

## Database Schema

```sql
ALTER TABLE customers ADD COLUMN avatar_path TEXT;
ALTER TABLE customers ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN profile_note TEXT NOT NULL DEFAULT '';
```

Avatar файлууд: `/var/data/uploads/` (Render disk)

---

## Deployment Notes

### Render
1. `DB_PATH=/var/data/cargo.db`
2. Disk `/var/data` - зураг + DB
3. Node 20.x
4. `UPLOAD_DIR` auto: `{DATA_ROOT}/uploads`

### Local Dev
```bash
npm install
# Node 24 алдаа зөвшөөрнө (Render дээр 20)
npm start
```

Зургууд `./data/uploads/` хадгалагдана.
