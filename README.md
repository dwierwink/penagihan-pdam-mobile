# Penagihan PDAM Mobile

Aplikasi mobile penagihan PDAM yang dirancang untuk petugas lapangan, dilengkapi dengan pemetaan rute riil (jalan), kompresi foto persil otomatis, import data pelanggan dari Excel, dan master database pelanggan.

## Fitur Utama

- **Master Database Pelanggan**:
  - Tambah data pelanggan manual dengan format otomatis Nomor SMB (`xx-xxxxx`).
  - Import file Excel data pelanggan (No. SMB, Nama, Alamat, Latitude, Longitude).
  - Mode seleksi: ceklist satuan dan ceklist semua untuk penghapusan data secara kolektif.
  - Pencarian instan berdasarkan nama, alamat, atau nomor sambungan.

- **Daftar Tagihan & Periode**:
  - Transfer pelanggan dari master database ke tagihan bulanan spesifik (bulan & tahun).
  - Monitoring status pembayaran (Belum Bayar, Lunas) dengan ringkasan transaksi riil.

- **Rute Real-Time & Peta Jalan**:
  - Penentuan rute urutan penagihan terdekat berdasarkan lokasi GPS riil petugas (jalan raya, bukan garis lurus).
  - Integrasi navigasi Google Maps untuk membuka rute ke lokasi pelanggan.

- **Foto Persil Terkompresi**:
  - Ambil foto persil langsung via kamera atau galeri.
  - Kompresi gambar otomatis di bawah 300KB untuk efisiensi penyimpanan perangkat.
  - Cache persil tersimpan lintas periode untuk pelanggan yang sama.

## Download APK Android

APK Android dibangun secara otomatis melalui GitHub Actions:
1. Buka tab **Actions** di repositori ini.
2. Pilih workflow **Build Android APK (Penagihan PDAM)** terbaru.
3. Unduh artifact **Penagihan-PDAM-APK** dan install di perangkat Android Anda.

## Menjalankan Proyek Secara Lokal

```bash
# 1. Install dependencies
npm install

# 2. Jalankan Expo Dev Server
npx expo start
```
