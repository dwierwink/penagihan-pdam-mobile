import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  TextInput,
  Alert,
  Image,
  Linking,
  BackHandler,
  ToastAndroid,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import MapViewer from './components/MapViewer';
import MapPicker from './components/MapPicker';

const MONTHS = [
  'Jan', 'Feb', 'Mar',
  'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep',
  'Okt', 'Nov', 'Des',
];

const MONTH_NAMES = {
  Jan: 'Januari',
  Feb: 'Februari',
  Mar: 'Maret',
  Apr: 'April',
  Mei: 'Mei',
  Jun: 'Juni',
  Jul: 'Juli',
  Agu: 'Agustus',
  Sep: 'September',
  Okt: 'Oktober',
  Nov: 'November',
  Des: 'Desember',
};

// Helper untuk parse titik koordinat pelanggan ({ lat, lng })
const parseCustomerCoords = (item) => {
  if (!item) return null;
  if (
    typeof item.latitude === 'number' &&
    typeof item.longitude === 'number' &&
    !isNaN(item.latitude) &&
    !isNaN(item.longitude)
  ) {
    return { lat: item.latitude, lng: item.longitude };
  }
  if (item.koordinat && typeof item.koordinat === 'string') {
    const cleanStr = item.koordinat.replace(/[()]/g, '');
    const parts = cleanStr.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lng: parts[1] };
    }
  }
  return null;
};

// Helper untuk membaca nilai kolom file Excel dengan toleransi variasi penamaan header
const findColumnValue = (row, possibleNames) => {
  if (!row || typeof row !== 'object') return null;
  const keys = Object.keys(row);
  // 1. Cek kecocokan persis (exact match)
  for (const name of possibleNames) {
    const target = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key of keys) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedKey === target) {
        return row[key];
      }
    }
  }
  // 2. Cek kecocokan sebagian (partial match)
  for (const name of possibleNames) {
    const target = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (target.length < 3) continue;
    for (const key of keys) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedKey.includes(target) || target.includes(normalizedKey)) {
        return row[key];
      }
    }
  }
  return null;
};

// Hitung jarak Haversine dalam kilometer
const getHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // radius bumi dalam km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Format jarak agar ramah pengguna (misal: 250 m atau 1.5 km)
const formatDistanceText = (distKm) => {
  if (distKm == null || isNaN(distKm)) return null;
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
};

// ============================================================================
// STRUKTUR PENYIMPANAN INTERNAL HP (Head Folder & Subfolder Masing-Masing)
// ============================================================================
// 1. Head Folder: FileSystem.documentDirectory + 'PenagihanPDAM/'
// 2. Subfolder Database: .../PenagihanPDAM/database/
//    - pelanggan.json    : Master data pelanggan permanen
//    - tagihan.json      : Riwayat tagihan per periode
//    - cache_foto.json   : Pemetaan cache foto persil lintas periode
// 3. Subfolder Foto Persil: .../PenagihanPDAM/foto_persil/
//    - foto_persil_*.jpg : File fisik foto persil terkompresi <= 300KB
// ============================================================================

const HEAD_STORAGE_DIR =
  Platform.OS !== 'web' && FileSystem && FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}PenagihanPDAM/`
    : null;

const DATABASE_STORAGE_DIR = HEAD_STORAGE_DIR
  ? `${HEAD_STORAGE_DIR}database/`
  : null;

const PERSIL_STORAGE_DIR = HEAD_STORAGE_DIR
  ? `${HEAD_STORAGE_DIR}foto_persil/`
  : null;

const OLD_PERSIL_DIR =
  Platform.OS !== 'web' && FileSystem && FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}foto_persil/`
    : null;

const PELANGGAN_DB_FILE = DATABASE_STORAGE_DIR
  ? `${DATABASE_STORAGE_DIR}pelanggan.json`
  : null;

const TAGIHAN_DB_FILE = DATABASE_STORAGE_DIR
  ? `${DATABASE_STORAGE_DIR}tagihan.json`
  : null;

const FOTO_CACHE_DB_FILE = DATABASE_STORAGE_DIR
  ? `${DATABASE_STORAGE_DIR}cache_foto.json`
  : null;

// Pastikan folder internal tersedia
const ensureDirectoryExists = async (dirPath) => {
  if (!dirPath || Platform.OS === 'web' || !FileSystem) return;
  try {
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }
  } catch (err) {
    console.warn(`Gagal membuat folder ${dirPath}:`, err);
  }
};

// Inisialisasi Head Folder & Subfolder internal perangkat HP
const initStorageDirectories = async () => {
  if (Platform.OS === 'web' || !FileSystem || !HEAD_STORAGE_DIR) return;
  try {
    await ensureDirectoryExists(HEAD_STORAGE_DIR);
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    await ensureDirectoryExists(PERSIL_STORAGE_DIR);

    // Migrasi file foto dari direktori lama jika sebelumnya pernah tersimpan di root foto_persil/
    if (OLD_PERSIL_DIR) {
      try {
        const oldInfo = await FileSystem.getInfoAsync(OLD_PERSIL_DIR);
        if (oldInfo.exists && oldInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(OLD_PERSIL_DIR);
          for (const file of files) {
            const oldPath = `${OLD_PERSIL_DIR}${file}`;
            const newPath = `${PERSIL_STORAGE_DIR}${file}`;
            const newInfo = await FileSystem.getInfoAsync(newPath);
            if (!newInfo.exists) {
              await FileSystem.copyAsync({ from: oldPath, to: newPath });
            }
          }
        }
      } catch (migErr) {
        // Abaikan error migrasi opsional
      }
    }
  } catch (err) {
    console.warn('Gagal inisialisasi folder internal:', err);
  }
};

// 1. Simpan Master Database Data Pelanggan ke Penyimpanan Internal HP
const savePelangganToInternalStorage = async (data) => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('PDAM_MASTER_PELANGGAN_DB', JSON.stringify(data));
      }
      return;
    }
    if (!PELANGGAN_DB_FILE || !FileSystem) return;
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    await FileSystem.writeAsStringAsync(PELANGGAN_DB_FILE, JSON.stringify(data), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('Gagal menyimpan master database pelanggan:', err);
  }
};

// 2. Baca Master Database Data Pelanggan dari Penyimpanan Internal HP
const loadPelangganFromInternalStorage = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem('PDAM_MASTER_PELANGGAN_DB');
        if (raw) return JSON.parse(raw);
      }
      return [];
    }
    if (!PELANGGAN_DB_FILE || !FileSystem) return [];
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    const info = await FileSystem.getInfoAsync(PELANGGAN_DB_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(PELANGGAN_DB_FILE, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca master database pelanggan:', err);
  }
  return [];
};

// 3. Simpan Database Tagihan ke Penyimpanan Internal HP
const saveTagihanToInternalStorage = async (data) => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('PDAM_TAGIHAN_DB', JSON.stringify(data));
      }
      return;
    }
    if (!TAGIHAN_DB_FILE || !FileSystem) return;
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    await FileSystem.writeAsStringAsync(TAGIHAN_DB_FILE, JSON.stringify(data), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('Gagal menyimpan database tagihan:', err);
  }
};

// 4. Baca Database Tagihan dari Penyimpanan Internal HP
const loadTagihanFromInternalStorage = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem('PDAM_TAGIHAN_DB');
        if (raw) return JSON.parse(raw);
      }
      return [];
    }
    if (!TAGIHAN_DB_FILE || !FileSystem) return [];
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    const info = await FileSystem.getInfoAsync(TAGIHAN_DB_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(TAGIHAN_DB_FILE, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca database tagihan:', err);
  }
  return [];
};

// 5. Simpan Cache Foto Persil ke Penyimpanan Internal HP
const saveFotoCacheToInternalStorage = async (data) => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('PDAM_CACHE_FOTO_DB', JSON.stringify(data));
      }
      return;
    }
    if (!FOTO_CACHE_DB_FILE || !FileSystem) return;
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    await FileSystem.writeAsStringAsync(FOTO_CACHE_DB_FILE, JSON.stringify(data), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('Gagal menyimpan cache foto persil:', err);
  }
};

// 6. Baca Cache Foto Persil dari Penyimpanan Internal HP
const loadFotoCacheFromInternalStorage = async () => {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem('PDAM_CACHE_FOTO_DB');
        if (raw) return JSON.parse(raw);
      }
      return {};
    }
    if (!FOTO_CACHE_DB_FILE || !FileSystem) return {};
    await ensureDirectoryExists(DATABASE_STORAGE_DIR);
    const info = await FileSystem.getInfoAsync(FOTO_CACHE_DB_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(FOTO_CACHE_DB_FILE, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (content) {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca cache foto persil:', err);
  }
  return {};
};

// Fungsi kompresi foto agar ukuran tidak lebih dari 300 KB & simpan permanen ke penyimpanan HP
const compressAndSaveFotoPersil = async (sourceUri, identifier) => {
  if (!sourceUri) return null;
  const MAX_BYTES = 300 * 1024; // Maksimal 300 KB (307.200 bytes)

  // Fallback platform Web menggunakan HTML5 Canvas
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(sourceUri);
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let byteSize = Math.round((dataUrl.length * 3) / 4);

        while (byteSize > MAX_BYTES && quality > 0.2) {
          quality -= 0.15;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          byteSize = Math.round((dataUrl.length * 3) / 4);
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(sourceUri);
      img.src = sourceUri;
    });
  }

  // Platform Native (Android & iOS)
  try {
    let currentUri = sourceUri;
    let targetWidth = 1280;
    let currentQuality = 0.8;
    let currentSize = 0;

    // Pastikan folder penyimpanan foto persil di HP sudah ada
    if (PERSIL_STORAGE_DIR) {
      const dirInfo = await FileSystem.getInfoAsync(PERSIL_STORAGE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(PERSIL_STORAGE_DIR, { intermediates: true });
      }
    }

    // Iterasi kompresi bertahap untuk memastikan ukuran strictly <= 300 KB
    for (let i = 0; i < 5; i++) {
      const actions = [];
      if (targetWidth) {
        actions.push({ resize: { width: targetWidth } });
      }

      const manipResult = await ImageManipulator.manipulateAsync(
        currentUri,
        actions,
        {
          compress: currentQuality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const info = await FileSystem.getInfoAsync(manipResult.uri);
      currentUri = manipResult.uri;
      currentSize = info.size || 0;

      // Jika ukuran sudah <= 300 KB, kompresi berhasil
      if (currentSize <= MAX_BYTES) {
        break;
      }

      // Turunkan resolusi & kualitas kompresi jika masih di atas 300 KB
      if (i === 0) {
        targetWidth = 1024;
        currentQuality = 0.7;
      } else if (i === 1) {
        targetWidth = 850;
        currentQuality = 0.6;
      } else if (i === 2) {
        targetWidth = 720;
        currentQuality = 0.5;
      } else {
        targetWidth = 600;
        currentQuality = 0.4;
      }
    }

    // Simpan permanen ke penyimpanan HP (FileSystem.documentDirectory)
    let permanentUri = currentUri;
    if (PERSIL_STORAGE_DIR) {
      const safeId = String(identifier || 'persil').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `foto_persil_${safeId}_${Date.now()}.jpg`;
      permanentUri = `${PERSIL_STORAGE_DIR}${filename}`;
      await FileSystem.copyAsync({
        from: currentUri,
        to: permanentUri,
      });
    }

    // Simpan juga salinan ke Galeri / Media Library HP agar pengguna dapat melihatnya langsung di HP
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(permanentUri);
      }
    } catch (mediaErr) {
      console.log('MediaLibrary info:', mediaErr);
    }

    return permanentUri;
  } catch (err) {
    console.warn('Gagal mengompresi / menyimpan foto persil:', err);
    return sourceUri;
  }
};

function MainApp() {
  // Navigation state: 'home' | 'daftar_tagihan' | 'rute_tagihan'
  const [currentScreen, setCurrentScreen] = useState('home');
  const [modalVisible, setModalVisible] = useState(false);

  // Periode Penagihan Aktif (Bulan & Tahun)
  const [selectedMonth, setSelectedMonth] = useState('Okt');
  const [selectedYear, setSelectedYear] = useState(2026);

  // Modal Pop-up Pilih Bulan & Tahun (untuk Transfer Data Pelanggan & Filter Daftar Tagihan)
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [periodModalMode, setPeriodModalMode] = useState('view_tagihan'); // 'view_tagihan' | 'transfer_pelanggan'
  const [pendingPelanggan, setPendingPelanggan] = useState(null);
  const [modalYear, setModalYear] = useState(2026);

  // User real-time high-accuracy GPS location
  const [userLocation, setUserLocation] = useState(null);

  // Master Data Pelanggan State
  const [daftarPelanggan, setDaftarPelanggan] = useState([]);
  const [selectedPelangganIds, setSelectedPelangganIds] = useState([]);
  const [pelangganSearchQuery, setPelangganSearchQuery] = useState('');
  const [expandedPelangganId, setExpandedPelangganId] = useState(null);
  const [expandedTagihanId, setExpandedTagihanId] = useState(null);

  // Daftar Tagihan Pelanggan (Hasil transfer dari Data Pelanggan)
  const [daftarTagihanPelanggan, setDaftarTagihanPelanggan] = useState([]);
  const [fotoPersilByPelanggan, setFotoPersilByPelanggan] = useState({}); // Cache foto persil per pelanggan (otomatis tersimpan lintas periode)
  const [selectedPhotoFull, setSelectedPhotoFull] = useState(null); // Modal fullscreen viewer foto persil
  const [successModalData, setSuccessModalData] = useState(null); // Modal popup "Berhasil Ditambahkan"

  // Jarak rute jalan riil dari lokasi saya ke masing-masing pelanggan (bukan garis lurus)
  const [roadDistances, setRoadDistances] = useState({});
  const roadDistanceCacheRef = useRef(new Map());

  // Status loading data dari internal storage
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Inisialisasi & Muat seluruh database dari penyimpanan internal saat aplikasi dibuka
  useEffect(() => {
    let isMounted = true;
    const initializeDatabase = async () => {
      await initStorageDirectories();
      const [savedPelanggan, savedTagihan, savedFotoCache] = await Promise.all([
        loadPelangganFromInternalStorage(),
        loadTagihanFromInternalStorage(),
        loadFotoCacheFromInternalStorage(),
      ]);

      if (isMounted) {
        if (savedPelanggan && Array.isArray(savedPelanggan) && savedPelanggan.length > 0) {
          setDaftarPelanggan(savedPelanggan);
        }
        if (savedTagihan && Array.isArray(savedTagihan) && savedTagihan.length > 0) {
          setDaftarTagihanPelanggan(savedTagihan);
        }
        if (savedFotoCache && typeof savedFotoCache === 'object' && Object.keys(savedFotoCache).length > 0) {
          setFotoPersilByPelanggan(savedFotoCache);
        }
        setIsStorageLoaded(true);
      }
    };

    initializeDatabase();
    return () => {
      isMounted = false;
    };
  }, []);

  // Simpan otomatis ke penyimpanan internal jika Master Data Pelanggan berubah
  useEffect(() => {
    if (!isStorageLoaded) return;
    savePelangganToInternalStorage(daftarPelanggan);
  }, [daftarPelanggan, isStorageLoaded]);

  // Simpan otomatis ke penyimpanan internal jika Daftar Tagihan berubah
  useEffect(() => {
    if (!isStorageLoaded) return;
    saveTagihanToInternalStorage(daftarTagihanPelanggan);
  }, [daftarTagihanPelanggan, isStorageLoaded]);

  // Simpan otomatis ke penyimpanan internal jika Cache Foto Persil berubah
  useEffect(() => {
    if (!isStorageLoaded) return;
    saveFotoCacheToInternalStorage(fotoPersilByPelanggan);
  }, [fotoPersilByPelanggan, isStorageLoaded]);

  // Data pelanggan untuk rute tagihan sesuai periode aktif (dimemoize agar tidak re-render berulang kali saat GPS bergerak)
  const rutePelanggan = useMemo(() => {
    const map = new Map();
    daftarTagihanPelanggan.forEach((t) => {
      if (t && t.periodeBulan === selectedMonth && t.periodeTahun === selectedYear) {
        const key = t.tagihanId || t.id || t.noSmb || t.nama;
        if (key && !map.has(key)) {
          map.set(key, t);
        }
      }
    });
    daftarPelanggan.forEach((p) => {
      if (p && p.periodeBulan === selectedMonth && p.periodeTahun === selectedYear) {
        const key = p.tagihanId || p.id || p.noSmb || p.nama;
        if (key && !map.has(key)) {
          map.set(key, p);
        }
      }
    });
    return Array.from(map.values());
  }, [daftarTagihanPelanggan, daftarPelanggan, selectedMonth, selectedYear]);

  // Android Back button handler: jangan langsung keluar aplikasi jika ditekan tombol back
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    const onBackPress = () => {
      // 1. Jika modal foto fullscreen terbuka -> tutup modal
      if (selectedPhotoFull) {
        setSelectedPhotoFull(null);
        return true;
      }

      // 2. Jika modal pilih periode terbuka -> tutup modal
      if (periodModalVisible) {
        setPeriodModalVisible(false);
        setPendingPelanggan(null);
        return true;
      }

      // 3. Jika modal pilih menu tagihan terbuka -> tutup modal
      if (modalVisible) {
        setModalVisible(false);
        return true;
      }

      // 4. Jika modal berhasil terbuka -> tutup modal
      if (successModalData) {
        setSuccessModalData(null);
        return true;
      }

      // 5. Jika berada di pemilih titik maps -> kembali ke form manual
      if (currentScreen === 'pilih_titik_alamat') {
        setCurrentScreen('tambah_pelanggan_manual');
        return true;
      }

      // 6. Jika berada di form tambah pelanggan manual -> kembali ke data pelanggan
      if (currentScreen === 'tambah_pelanggan_manual') {
        setCurrentScreen('data_pelanggan');
        return true;
      }

      // 7. Jika berada di master data pelanggan
      if (currentScreen === 'data_pelanggan') {
        if (selectedPelangganIds.length > 0) {
          setSelectedPelangganIds([]);
          return true;
        }
        setCurrentScreen('home');
        return true;
      }

      // 8. Jika berada di daftar tagihan -> kembali ke home
      if (currentScreen === 'daftar_tagihan') {
        setCurrentScreen('home');
        return true;
      }

      // 9. Jika berada di rute tagihan -> kembali ke home
      if (currentScreen === 'rute_tagihan') {
        setCurrentScreen('home');
        return true;
      }

      // 10. Jika berada di layar utama ('home'): jangan langsung keluar aplikasi (butuh tap 2x)
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Tekan sekali lagi untuk keluar aplikasi', ToastAndroid.SHORT);
      }
      return true;
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => backSubscription.remove();
  }, [
    currentScreen,
    selectedPhotoFull,
    periodModalVisible,
    modalVisible,
    successModalData,
    selectedPelangganIds,
  ]);

  // State form tambah pelanggan manual
  const [manualNomorSmb, setManualNomorSmb] = useState('');
  const [manualNama, setManualNama] = useState('');
  const [manualAlamat, setManualAlamat] = useState('');
  const [manualFoto, setManualFoto] = useState(null);
  const [manualCoords, setManualCoords] = useState(null);
  const [tempPickerCoords, setTempPickerCoords] = useState(null);

  // Ref input field untuk perpindahan fokus otomatis antar kolom
  const namaInputRef = useRef(null);
  const alamatInputRef = useRef(null);

  // Formatter input Nomor SMB: otomatis gabungkan 2 digit awal dan 5 digit akhir dengan simbol (-)
  const handleNomorSmbChange = (text) => {
    const isDeleting = text.length < manualNomorSmb.length;
    const digits = text.replace(/\D/g, '').slice(0, 7);
    if (!digits) {
      setManualNomorSmb('');
      return;
    }
    if (digits.length <= 2) {
      if (!isDeleting && digits.length === 2) {
        setManualNomorSmb(`${digits}-`);
      } else {
        setManualNomorSmb(digits);
      }
      return;
    }
    const formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    setManualNomorSmb(formatted);

    // Jika nomor SMB sudah terisi penuh (7 digit), otomatis pindah selanjutnya ke kolom Nama Pelanggan
    if (!isDeleting && digits.length === 7) {
      setTimeout(() => {
        namaInputRef.current?.focus();
      }, 50);
    }
  };

  // Simpan foto persil untuk pelanggan (otomatis tersimpan untuk periode saat ini dan periode selanjutnya)
  const saveFotoPersilForPelanggan = (tagihanId, photoUri) => {
    // Cari tagihan target untuk mendapatkan ID dan No SMB pelanggan
    const targetTagihan = daftarTagihanPelanggan.find(
      (item) => (item.tagihanId || item.id) === tagihanId
    );
    const customerId = targetTagihan?.id || tagihanId;
    const customerNoSmb = targetTagihan?.noSmb;

    // 1. Simpan foto persil ke semua tagihan pelanggan ini di daftar tagihan (lintas periode)
    setDaftarTagihanPelanggan((prev) => {
      const updated = prev.map((item) =>
        (item.tagihanId || item.id) === tagihanId ||
          (customerId && item.id === customerId) ||
          (customerNoSmb && item.noSmb === customerNoSmb)
          ? { ...item, fotoPersil: photoUri }
          : item
      );
      saveTagihanToInternalStorage(updated);
      return updated;
    });

    // 2. Simpan juga ke master data pelanggan agar saat ditransfer ke periode selanjutnya foto otomatis terbawa
    setDaftarPelanggan((prev) => {
      const updated = prev.map((item) =>
        item.id === customerId || (customerNoSmb && item.noSmb === customerNoSmb)
          ? { ...item, fotoPersil: photoUri }
          : item
      );
      savePelangganToInternalStorage(updated);
      return updated;
    });

    // 3. Simpan di map cache fotoPersilByPelanggan
    setFotoPersilByPelanggan((prev) => {
      const updated = {
        ...prev,
        ...(customerId ? { [customerId]: photoUri } : {}),
        ...(customerNoSmb ? { [customerNoSmb]: photoUri } : {}),
      };
      saveFotoCacheToInternalStorage(updated);
      return updated;
    });
  };

  // Hapus foto persil untuk pelanggan
  const handleHapusFotoPersilTagihan = async (tagihanId) => {
    const targetTagihan = daftarTagihanPelanggan.find(
      (item) => (item.tagihanId || item.id) === tagihanId
    );
    const customerId = targetTagihan?.id || tagihanId;
    const customerNoSmb = targetTagihan?.noSmb;
    const oldPhotoUri = targetTagihan?.fotoPersil;

    // Bersihkan file fisik dari penyimpanan dokumen HP jika ada
    if (oldPhotoUri && Platform.OS !== 'web' && FileSystem && FileSystem.deleteAsync) {
      try {
        await FileSystem.deleteAsync(oldPhotoUri, { idempotent: true });
      } catch (e) { }
    }

    setDaftarTagihanPelanggan((prev) => {
      const updated = prev.map((item) =>
        (item.tagihanId || item.id) === tagihanId ||
          (customerId && item.id === customerId) ||
          (customerNoSmb && item.noSmb === customerNoSmb)
          ? { ...item, fotoPersil: null }
          : item
      );
      saveTagihanToInternalStorage(updated);
      return updated;
    });

    setDaftarPelanggan((prev) => {
      const updated = prev.map((item) =>
        item.id === customerId || (customerNoSmb && item.noSmb === customerNoSmb)
          ? { ...item, fotoPersil: null }
          : item
      );
      savePelangganToInternalStorage(updated);
      return updated;
    });

    setFotoPersilByPelanggan((prev) => {
      const updated = { ...prev };
      if (customerId) delete updated[customerId];
      if (customerNoSmb) delete updated[customerNoSmb];
      saveFotoCacheToInternalStorage(updated);
      return updated;
    });
  };

  // Buka Kamera HP Otomatis untuk Foto Persil pada Daftar Tagihan (Simpan utuh tanpa terpotong)
  const handleBukaKameraTagihan = async (tagihanId) => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Izin Kamera', 'Izin kamera diperlukan untuk mengambil foto persil.');
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false, // Simpan ukuran asli kamera tanpa terpotong / crop
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawPhotoUri = result.assets[0].uri;
        // Kompres ukuran foto agar tidak lebih dari 300 KB dan simpan permanen ke penyimpanan HP
        const permanentPhotoUri = await compressAndSaveFotoPersil(rawPhotoUri, tagihanId);
        saveFotoPersilForPelanggan(tagihanId, permanentPhotoUri);
      }
    } catch (err) {
      console.warn('Buka kamera error:', err);
      if (Platform.OS === 'web') {
        alert('Gagal membuka kamera: ' + err.message);
      } else {
        Alert.alert('Kamera', 'Tidak dapat membuka kamera: ' + err.message);
      }
    }
  };

  // Buka Galeri HP Otomatis untuk Foto Persil pada Daftar Tagihan (Simpan utuh tanpa terpotong)
  const handleBukaGaleriTagihan = async (tagihanId) => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Izin Galeri', 'Izin galeri diperlukan untuk memilih foto persil.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false, // Simpan ukuran asli gambar tanpa terpotong / crop
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawPhotoUri = result.assets[0].uri;
        // Kompres ukuran foto agar tidak lebih dari 300 KB dan simpan permanen ke penyimpanan HP
        const permanentPhotoUri = await compressAndSaveFotoPersil(rawPhotoUri, tagihanId);
        saveFotoPersilForPelanggan(tagihanId, permanentPhotoUri);
      }
    } catch (err) {
      console.warn('Buka galeri error:', err);
      if (Platform.OS === 'web') {
        alert('Gagal membuka galeri: ' + err.message);
      } else {
        Alert.alert('Galeri', 'Tidak dapat membuka galeri: ' + err.message);
      }
    }
  };

  // Buka Kamera HP Otomatis (Manual Form Fallback)
  const handleBukaKamera = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Izin Kamera', 'Izin kamera diperlukan untuk mengambil foto persil.');
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawPhotoUri = result.assets[0].uri;
        const permanentPhotoUri = await compressAndSaveFotoPersil(rawPhotoUri, 'manual');
        setManualFoto(permanentPhotoUri);
      }
    } catch (err) {
      console.warn('Buka kamera error:', err);
      if (Platform.OS === 'web') {
        alert('Gagal membuka kamera: ' + err.message);
      } else {
        Alert.alert('Kamera', 'Tidak dapat membuka kamera: ' + err.message);
      }
    }
  };

  // Buka Galeri HP Otomatis (Manual Form Fallback)
  const handleBukaGaleri = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Izin Galeri', 'Izin galeri diperlukan untuk memilih foto persil.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const rawPhotoUri = result.assets[0].uri;
        const permanentPhotoUri = await compressAndSaveFotoPersil(rawPhotoUri, 'manual');
        setManualFoto(permanentPhotoUri);
      }
    } catch (err) {
      console.warn('Buka galeri error:', err);
      if (Platform.OS === 'web') {
        alert('Gagal membuka galeri: ' + err.message);
      } else {
        Alert.alert('Galeri', 'Tidak dapat membuka galeri: ' + err.message);
      }
    }
  };

  // Set untuk pencarian ID terpilih berkecepatan tinggi O(1)
  const selectedPelangganSet = useMemo(
    () => new Set(selectedPelangganIds),
    [selectedPelangganIds]
  );

  // Filter pencarian data pelanggan (memoized agar tidak menghitung ulang saat GPS atau state lain berkedip)
  const filteredPelanggan = useMemo(() => {
    if (!pelangganSearchQuery.trim()) return daftarPelanggan;
    const q = pelangganSearchQuery.toLowerCase().trim();
    return daftarPelanggan.filter((p) => {
      const nama = p.nama ? p.nama.toLowerCase() : '';
      const noSmb = p.noSmb ? p.noSmb.toLowerCase() : '';
      const alamat = p.alamat ? p.alamat.toLowerCase() : '';
      return nama.includes(q) || noSmb.includes(q) || alamat.includes(q);
    });
  }, [daftarPelanggan, pelangganSearchQuery]);

  // Status apakah seluruh data pelanggan yang tampil telah diceklist (O(1) instant)
  const isAllPelangganSelected = useMemo(() => {
    if (filteredPelanggan.length === 0 || selectedPelangganIds.length === 0) return false;
    if (selectedPelangganIds.length < filteredPelanggan.length) return false;
    return filteredPelanggan.every((p) => selectedPelangganSet.has(p.id));
  }, [filteredPelanggan, selectedPelangganIds.length, selectedPelangganSet]);

  // Handler toggle ceklist per pelanggan
  const toggleSelectPelanggan = (id) => {
    setSelectedPelangganIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  // Handler ceklist semua / batal ceklist semua data pelanggan
  const handleSelectAllPelanggan = () => {
    if (isAllPelangganSelected) {
      const currentFilteredIds = new Set(filteredPelanggan.map((p) => p.id));
      setSelectedPelangganIds((prev) => prev.filter((id) => !currentFilteredIds.has(id)));
    } else {
      const visibleIds = filteredPelanggan.map((p) => p.id);
      setSelectedPelangganIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Handler hapus kolektif beberapa data pelanggan yang diceklist
  const handleDeleteCollectivePelanggan = () => {
    if (selectedPelangganIds.length === 0) return;
    const count = selectedPelangganIds.length;
    const confirmTitle = 'Hapus Pelanggan Terpilih';
    const confirmMessage = `Apakah Anda yakin ingin menghapus ${count} data pelanggan yang diceklist secara kolektif dari master database? Data yang dihapus tidak dapat dikembalikan.`;

    const executeDelete = () => {
      setDaftarPelanggan((prev) => {
        const updated = prev.filter((p) => !selectedPelangganIds.includes(p.id));
        savePelangganToInternalStorage(updated);
        return updated;
      });
      setSelectedPelangganIds([]);
      if (Platform.OS === 'web') {
        alert(`${count} data pelanggan berhasil dihapus secara kolektif.`);
      } else {
        Alert.alert('Sukses', `${count} data pelanggan berhasil dihapus secara kolektif.`);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${confirmTitle}\n\n${confirmMessage}`)) {
        executeDelete();
      }
    } else {
      Alert.alert(
        confirmTitle,
        confirmMessage,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: `Hapus (${count})`,
            style: 'destructive',
            onPress: executeDelete,
          },
        ]
      );
    }
  };

  // Handler Simpan Data Pelanggan Manual
  const handleSimpanPelanggan = () => {
    const smbParts = manualNomorSmb.split('-');
    const part1 = (smbParts[0] || '').trim();
    const part2 = (smbParts[1] || '').trim();

    if (!part1 || !part2 || !manualAlamat.trim()) {
      if (Platform.OS === 'web') {
        alert('Harap lengkapi Nomor SMB dan Alamat!');
      } else {
        Alert.alert('Form Belum Lengkap', 'Harap lengkapi Nomor SMB dan Alamat!');
      }
      return;
    }

    const inputSmb = `${part1}-${part2}`;
    const cleanDigits = (s) => (s ? String(s).replace(/\D/g, '') : '');
    const inputDigits = cleanDigits(inputSmb);

    // Cek apakah nomor SMB sudah ada dalam data pelanggan (cegah data ganda)
    const duplicatePelanggan = daftarPelanggan.find((p) => {
      if (!p.noSmb) return false;
      const sameExact = p.noSmb.trim().toLowerCase() === inputSmb.trim().toLowerCase();
      const sameDigits = inputDigits.length > 0 && cleanDigits(p.noSmb) === inputDigits;
      return sameExact || sameDigits;
    });

    if (duplicatePelanggan) {
      const feedbackPemberitahuan = `Nomor SMB "${inputSmb}" sudah terdaftar dalam data pelanggan atas nama "${duplicatePelanggan.nama}".\n\nData ganda tidak diperbolehkan. Harap gunakan Nomor SMB lain!`;
      if (Platform.OS === 'web') {
        alert(feedbackPemberitahuan);
      } else {
        Alert.alert('Nomor SMB Sudah Ada (Data Ganda)', feedbackPemberitahuan);
      }
      return;
    }

    const finalNama = manualNama.trim() || 'Super Pelanggan';

    const newCustomer = {
      id: Date.now().toString(),
      noSmb: inputSmb,
      nama: finalNama,
      alamat: manualAlamat.trim(),
      foto: manualFoto || 'Tersedia',
      koordinat: manualCoords || (userLocation ? `${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}` : '-7.25751, 112.75214'),
      status: 'Aktif',
      tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
    };

    setDaftarPelanggan((prev) => {
      const updated = [newCustomer, ...prev];
      savePelangganToInternalStorage(updated);
      return updated;
    });

    // Reset Form Input
    setManualNomorSmb('');
    setManualNama('');
    setManualAlamat('');
    setManualFoto(null);
    setManualCoords(null);

    // Langsung arahkan ke Data Pelanggan untuk melihat data yang baru disimpan
    setCurrentScreen('data_pelanggan');
  };

  const handleDeletePelanggan = (id) => {
    setDaftarPelanggan((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      savePelangganToInternalStorage(updated);
      return updated;
    });
    setSelectedPelangganIds((prev) => prev.filter((itemId) => itemId !== id));
  };

  const [isImportingExcel, setIsImportingExcel] = useState(false);

  // Handler Upload / Import File Excel untuk Data Pelanggan
  const handleImportExcel = async () => {
    try {
      setIsImportingExcel(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setIsImportingExcel(false);
        return;
      }

      const asset = result.assets[0];
      let workbook;

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
      } else {
        let base64;
        try {
          base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          workbook = XLSX.read(base64, { type: 'base64' });
        } catch (readErr) {
          // Fallback: baca via fetch jika FileSystem gagal baca content:// URI
          const response = await fetch(asset.uri);
          const arrayBuffer = await response.arrayBuffer();
          workbook = XLSX.read(arrayBuffer, { type: 'array' });
        }
      }

      const sheetName = workbook.SheetNames && workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('File Excel tidak memiliki lembar kerja (sheet).');
      }

      const worksheet = workbook.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!aoa || aoa.length === 0) {
        throw new Error('Tidak ada data baris yang ditemukan di dalam file Excel.');
      }

      // Deteksi baris kategori / header (cari di 5 baris pertama)
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(aoa.length, 5); i++) {
        const rowStr = (aoa[i] || []).map((c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
        if (
          rowStr.includes('smb') ||
          rowStr.includes('alamat') ||
          rowStr.includes('lat') ||
          rowStr.includes('long') ||
          rowStr.includes('nama')
        ) {
          headerRowIndex = i;
          break;
        }
      }

      const headers = (aoa[headerRowIndex] || []).map((h) => String(h || '').trim());
      const rawRows = aoa.slice(headerRowIndex + 1).map((r) => {
        const obj = {};
        headers.forEach((h, idx) => {
          if (h) obj[h] = r[idx] !== undefined ? r[idx] : '';
        });
        return obj;
      });

      if (!rawRows || rawRows.length === 0) {
        throw new Error('Tidak ada data baris pelanggan yang ditemukan setelah baris kategori.');
      }

      const cleanDigits = (s) => (s ? String(s).replace(/\D/g, '') : '');
      const existingSmbSet = new Set(
        daftarPelanggan.map((p) => (p.noSmb ? p.noSmb.trim().toLowerCase() : '')).filter(Boolean)
      );
      const existingDigitsSet = new Set(
        daftarPelanggan.map((p) => cleanDigits(p.noSmb)).filter((d) => d.length > 0)
      );

      const seenSmbInFile = new Set();
      const importedCustomers = [];
      const duplicateSmbList = [];
      const timestamp = Date.now();

      rawRows.forEach((row, index) => {
        // Ambil No SMB (Kategori No. Smb)
        const rawSmb = findColumnValue(row, [
          'no. smb', 'no smb', 'nosmb', 'nomor smb', 'no sambungan', 'no_smb', 'smb', 'nomor pelanggan', 'no pelanggan', 'id pelanggan', 'kategori no. smb', 'kategori no smb'
        ]);
        // Ambil Nama Pelanggan (Kategori Nama Pelanggan - jika tidak ada otomatis Super Pelanggan)
        const rawNama = findColumnValue(row, [
          'nama pelanggan', 'nama', 'nama_pelanggan', 'customer', 'customer name', 'nama konsumen', 'nama lengkap', 'kategori nama pelanggan', 'kategori nama'
        ]);
        // Ambil Alamat (Kategori Alamat)
        const rawAlamat = findColumnValue(row, [
          'alamat', 'alamat pelanggan', 'address', 'alamat rumah', 'lokasi', 'kategori alamat'
        ]);
        // Ambil Latitude & Longitude / Longtitude
        const rawLat = findColumnValue(row, [
          'latitude', 'lat', 'garis lintang', 'lintang', 'kategori latitude', 'kategori lat'
        ]);
        const rawLng = findColumnValue(row, [
          'longtitude', 'longitude', 'long', 'lng', 'garis bujur', 'bujur', 'kategori longitude', 'kategori longtitude'
        ]);
        const rawCoord = findColumnValue(row, [
          'titik koordinat', 'titik kordinat', 'koordinat', 'coords', 'coord', 'kategori koordinat'
        ]);

        // Lewati baris kosong jika tidak ada data sama sekali
        if (!rawSmb && !rawAlamat && !rawNama && !rawLat && !rawLng && !rawCoord) return;

        let latNum = null;
        let lngNum = null;

        if (rawLat !== null && rawLng !== null && rawLat !== '' && rawLng !== '') {
          const parsedLat = parseFloat(String(rawLat).replace(',', '.'));
          const parsedLng = parseFloat(String(rawLng).replace(',', '.'));
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            // Auto-koreksi jika kolom latitude dan longitude tertukar (di Indonesia lat sekitar -7.x dan lng sekitar 112.x)
            if (parsedLat > 50 && parsedLng < 20) {
              latNum = parsedLng;
              lngNum = parsedLat;
            } else {
              latNum = parsedLat;
              lngNum = parsedLng;
            }
          }
        } else if (rawCoord) {
          const clean = String(rawCoord).replace(/[()]/g, '');
          const parts = clean.split(',').map((s) => parseFloat(s.trim().replace(',', '.')));
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            if (parts[0] > 50 && parts[1] < 20) {
              latNum = parts[1];
              lngNum = parts[0];
            } else {
              latNum = parts[0];
              lngNum = parts[1];
            }
          }
        }

        // Format No. SMB
        let finalSmb = rawSmb ? String(rawSmb).trim() : `01-${String(index + 1).padStart(5, '0')}`;
        const digitsOnly = finalSmb.replace(/\D/g, '');
        if ((digitsOnly.length === 6 || digitsOnly.length === 7) && !finalSmb.includes('-') && !finalSmb.includes('.')) {
          const padded = digitsOnly.padStart(7, '0');
          finalSmb = `${padded.slice(0, 2)}-${padded.slice(2)}`;
        }

        const smbKey = finalSmb.toLowerCase();
        const smbDigits = digitsOnly;

        // Cek apakah No SMB sudah ada di master database pelanggan atau ganda di file Excel itu sendiri
        const isDuplicateDb = existingSmbSet.has(smbKey) || (smbDigits && existingDigitsSet.has(smbDigits));
        const isDuplicateFile = seenSmbInFile.has(smbKey) || (smbDigits && seenSmbInFile.has(smbDigits));

        if (isDuplicateDb || isDuplicateFile) {
          duplicateSmbList.push({
            noSmb: finalSmb,
            nama: rawNama ? String(rawNama).trim() : 'Super Pelanggan',
            alasan: isDuplicateDb ? 'Sudah ada di data pelanggan' : 'Ganda di file Excel',
          });
          return; // Lewati agar tidak ada data ganda masuk ke database
        }

        seenSmbInFile.add(smbKey);
        if (smbDigits) seenSmbInFile.add(smbDigits);

        // Format titik koordinat sesuai instruksi: digabung dengan format (latitude, longtitude)
        const finalLat = latNum !== null ? latNum : (userLocation ? userLocation.lat : -7.25751);
        const finalLng = lngNum !== null ? lngNum : (userLocation ? userLocation.lng : 112.75214);
        const koordinatFormatted = `(${finalLat}, ${finalLng})`;

        // Nama pelanggan otomatis "Super Pelanggan" jika tidak ada di Excel
        const finalNama = (rawNama && String(rawNama).trim()) ? String(rawNama).trim() : 'Super Pelanggan';
        const finalAlamat = (rawAlamat && String(rawAlamat).trim()) ? String(rawAlamat).trim() : 'Alamat Belum Diatur';

        importedCustomers.push({
          id: `IMP-${timestamp}-${index + 1}`,
          noSmb: finalSmb,
          nama: finalNama,
          alamat: finalAlamat,
          koordinat: koordinatFormatted,
          latitude: finalLat,
          longitude: finalLng,
          foto: 'Tersedia',
          status: 'Aktif',
          tanggal: new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
        });
      });

      if (importedCustomers.length === 0) {
        if (duplicateSmbList.length > 0) {
          const contohGanda = duplicateSmbList.slice(0, 3).map((d) => `${d.noSmb} (${d.nama})`).join(', ');
          const pesanSemuaGanda = `Tidak ada data baru yang ditambahkan karena seluruh Nomor SMB (${duplicateSmbList.length} data) dalam file Excel sudah terdaftar di data pelanggan (data ganda):\n\n${contohGanda}${duplicateSmbList.length > 3 ? '...' : ''}\n\nSistem menolak data ganda agar database tetap rapi.`;
          if (Platform.OS === 'web') {
            alert(pesanSemuaGanda);
          } else {
            Alert.alert('Nomor SMB Ganda Terdeteksi', pesanSemuaGanda);
          }
          return;
        }
        throw new Error(
          'Tidak ada data pelanggan yang cocok. Pastikan file Excel memiliki baris kategori: No. SMB, Alamat, Latitude, dan Longitude (Nama Pelanggan opsional).'
        );
      }

      // Masukkan semua data ke dalam data pelanggan dan simpan ke internal storage
      setDaftarPelanggan((prev) => {
        const updated = [...importedCustomers, ...prev];
        savePelangganToInternalStorage(updated);
        return updated;
      });

      let pesanSukses = `Berhasil mengimpor ${importedCustomers.length} data pelanggan baru dari file "${asset.name}".`;
      if (duplicateSmbList.length > 0) {
        const contohLewat = duplicateSmbList.slice(0, 2).map((d) => d.noSmb).join(', ');
        pesanSukses += `\n\nCatatan: ${duplicateSmbList.length} data dengan Nomor SMB ganda telah dilewati otomatis (contoh: ${contohLewat}${duplicateSmbList.length > 2 ? '...' : ''}) agar tidak ada data ganda.`;
      }

      if (Platform.OS === 'web') {
        alert(pesanSukses);
      } else {
        Alert.alert('Import Excel Berhasil', pesanSukses);
      }
    } catch (err) {
      console.warn('Gagal import file excel:', err);
      const pesanError = err?.message || 'Terjadi kesalahan saat membaca file Excel.';
      if (Platform.OS === 'web') {
        alert('Gagal Import Excel: ' + pesanError);
      } else {
        Alert.alert('Gagal Import Excel', pesanError);
      }
    } finally {
      setIsImportingExcel(false);
    }
  };

  // Buka Modal Pop-up Pilih Bulan & Tahun untuk Transfer Pelanggan
  const handleOpenTransferModal = (pelanggan) => {
    setPendingPelanggan(pelanggan);
    setModalYear(selectedYear);
    setPeriodModalMode('transfer_pelanggan');
    setPeriodModalVisible(true);
  };

  // Pilih Bulan & Tahun di Modal (Bisa dari Transfer Pelanggan maupun dari Menu Daftar Tagihan)
  const handleSelectPeriodMonth = (month) => {
    if (periodModalMode === 'transfer_pelanggan' && pendingPelanggan) {
      const targetCustomer = pendingPelanggan;
      const targetYear = modalYear;

      // Cek apakah pelanggan sudah terdaftar di tagihan periode tahun & bulan ini
      const sudahAda = daftarTagihanPelanggan.some(
        (item) =>
          (item.id === targetCustomer.id ||
            (item.noSmb && targetCustomer.noSmb && item.noSmb.trim().toLowerCase() === targetCustomer.noSmb.trim().toLowerCase())) &&
          item.periodeBulan === month &&
          item.periodeTahun === targetYear
      );

      if (sudahAda) {
        const msg = `Pelanggan "${targetCustomer.nama}" sudah terdaftar di Daftar Tagihan periode ${MONTH_NAMES[month]} ${targetYear}!`;
        if (Platform.OS === 'web') {
          alert(msg);
        } else {
          Alert.alert('Perhatian', msg);
        }
        return;
      }

      // Ambil foto persil yang sudah ada sebelumnya jika pernah diambil di daftar tagihan
      const existingFotoPersil =
        (targetCustomer.id && fotoPersilByPelanggan[targetCustomer.id]) ||
        (targetCustomer.noSmb && fotoPersilByPelanggan[targetCustomer.noSmb]) ||
        daftarTagihanPelanggan.find(
          (t) =>
            (t.id === targetCustomer.id || (t.noSmb && t.noSmb === targetCustomer.noSmb)) &&
            t.fotoPersil
        )?.fotoPersil ||
        targetCustomer.fotoPersil ||
        daftarPelanggan.find(
          (p) =>
            (p.id === targetCustomer.id || (p.noSmb && p.noSmb === targetCustomer.noSmb)) &&
            p.fotoPersil
        )?.fotoPersil ||
        null;

      const itemTagihan = {
        ...targetCustomer,
        fotoPersil: existingFotoPersil,
        tagihanId: `TGH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        periodeBulan: month,
        periodeTahun: targetYear,
        tanggalTransfer: new Date().toLocaleDateString('id-ID'),
      };

      setDaftarTagihanPelanggan((prev) => {
        const updated = [itemTagihan, ...prev];
        saveTagihanToInternalStorage(updated);
        return updated;
      });
      setSelectedMonth(month);
      setSelectedYear(targetYear);
      setPeriodModalVisible(false);
      setPendingPelanggan(null);

      // Tampilkan Pop-up "Berhasil Ditambahkan"
      const successMsg = `Data pelanggan "${targetCustomer.nama}" berhasil ditambahkan ke Daftar Tagihan periode ${MONTH_NAMES[month]} ${targetYear}.`;
      setSuccessModalData({
        title: 'Berhasil Ditambahkan',
        message: successMsg,
      });
    } else if (periodModalMode === 'view_rute') {
      // Mode 'view_rute': Set periode terpilih dan buka layar Rute Tagihan Pelanggan
      setSelectedMonth(month);
      setSelectedYear(modalYear);
      setPeriodModalVisible(false);
      setCurrentScreen('rute_tagihan');
    } else {
      // Mode 'view_tagihan': Set periode terpilih dan buka layar Daftar Tagihan
      setSelectedMonth(month);
      setSelectedYear(modalYear);
      setPeriodModalVisible(false);
      setCurrentScreen('daftar_tagihan');
    }
  };

  const handleHapusTagihan = (tagihanId) => {
    setDaftarTagihanPelanggan((prev) => {
      const updated = prev.filter((item) => (item.tagihanId || item.id) !== tagihanId);
      saveTagihanToInternalStorage(updated);
      return updated;
    });
  };


  // Render Modal Pop-up Pilih Bulan & Tahun (Sesuai Gambar)
  const renderPeriodPickerModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={periodModalVisible}
      onRequestClose={() => {
        setPeriodModalVisible(false);
        setPendingPelanggan(null);
      }}
    >
      <Pressable
        style={styles.periodModalOverlay}
        onPress={() => {
          setPeriodModalVisible(false);
          setPendingPelanggan(null);
        }}
      >
        <Pressable
          style={styles.periodModalCard}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <TouchableOpacity
            style={styles.periodModalCloseBtn}
            onPress={() => {
              setPeriodModalVisible(false);
              setPendingPelanggan(null);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Circular Calendar Avatar */}
          <View style={styles.pickerAvatar}>
            <View style={styles.calendarMiniCard}>
              <View style={styles.calendarMiniHeader}>
                <Text style={styles.calendarMiniHeaderText}>JUL</Text>
              </View>
              <View style={styles.calendarMiniBody}>
                <Text style={styles.calendarMiniBodyText}>17</Text>
              </View>
            </View>
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.pickerTitle}>Pilih Bulan & Tahun</Text>
          <Text style={styles.pickerSubtitle}>
            {periodModalMode === 'transfer_pelanggan' && pendingPelanggan
              ? `Tentukan periode penagihan untuk ${pendingPelanggan.nama}`
              : 'Tentukan periode penagihan rekening air pelanggan'}
          </Text>

          {/* Year Selector Capsule */}
          <View style={styles.yearCapsule}>
            <TouchableOpacity
              style={styles.yearNavBtn}
              onPress={() => setModalYear((prev) => prev - 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={18} color="#07326E" />
            </TouchableOpacity>

            <View style={styles.yearCenterCol}>
              <Text style={styles.yearLabel}>TAHUN</Text>
              <Text style={styles.yearValue}>{modalYear}</Text>
            </View>

            <TouchableOpacity
              style={styles.yearNavBtn}
              onPress={() => setModalYear((prev) => prev + 1)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={18} color="#07326E" />
            </TouchableOpacity>
          </View>

          {/* Month Section Header */}
          <View style={styles.monthHeaderRow}>
            <Text style={styles.monthHeaderTitle}>PILIH BULAN</Text>
            <View style={styles.currentMonthBadge}>
              <Text style={styles.currentMonthBadgeText}>
                Bulan Sekarang: {MONTH_NAMES[MONTHS[new Date().getMonth()]] || 'Oktober'}
              </Text>
            </View>
          </View>

          {/* Month Grid (12 Bulan, 3 Kolom) */}
          <View style={styles.monthGrid}>
            {MONTHS.map((month) => {
              const isSelected = selectedMonth === month && selectedYear === modalYear;
              return (
                <TouchableOpacity
                  key={month}
                  style={[
                    styles.monthCell,
                    isSelected && styles.monthCellSelected,
                  ]}
                  onPress={() => handleSelectPeriodMonth(month)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.monthCellText,
                      isSelected && styles.monthCellTextSelected,
                    ]}
                  >
                    {month}
                  </Text>
                  {isSelected && <View style={styles.monthActiveDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // Render Modal Fullscreen Viewer Foto Persil (Ukuran asli kamera tanpa terpotong)
  const renderPhotoViewerModal = () => {
    if (!selectedPhotoFull) return null;

    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!selectedPhotoFull}
        onRequestClose={() => setSelectedPhotoFull(null)}
      >
        <SafeAreaView style={styles.photoModalBackdrop} edges={['top', 'left', 'right', 'bottom']}>
          {/* Header Bar */}
          <View style={styles.photoModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoModalTitle} numberOfLines={1}>
                {selectedPhotoFull.title || 'Foto Persil'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.photoModalCloseBtn}
              onPress={() => setSelectedPhotoFull(null)}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Full Photo Container */}
          <Pressable
            style={styles.photoModalImageContainer}
            onPress={() => setSelectedPhotoFull(null)}
          >
            <Image
              source={{ uri: selectedPhotoFull.uri }}
              style={styles.photoModalFullImage}
              resizeMode="contain"
            />
          </Pressable>
        </SafeAreaView>
      </Modal>
    );
  };

  // Render Modal Pop-up "Berhasil Ditambahkan"
  const renderSuccessModal = () => {
    if (!successModalData) return null;
    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!successModalData}
        onRequestClose={() => setSuccessModalData(null)}
      >
        <Pressable
          style={styles.successModalOverlay}
          onPress={() => setSuccessModalData(null)}
        >
          <Pressable
            style={styles.successModalCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Success Icon Circle */}
            <View style={styles.successModalIconCircle}>
              <Ionicons name="checkmark-circle" size={54} color="#16A34A" />
            </View>

            {/* Title & Message */}
            <Text style={styles.successModalTitle}>Berhasil Ditambahkan</Text>
            <Text style={styles.successModalMessage}>{successModalData.message}</Text>

            {/* Buttons */}
            <View style={styles.successModalBtnRow}>
              <TouchableOpacity
                style={styles.successModalSecondaryBtn}
                onPress={() => setSuccessModalData(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.successModalSecondaryBtnText}>Tetap di Sini</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.successModalPrimaryBtn}
                onPress={() => {
                  setSuccessModalData(null);
                  setCurrentScreen('daftar_tagihan');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="receipt-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.successModalPrimaryBtnText}>Buka Tagihan</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  // Render Item FlatList untuk performa ultra tinggi (Virtualisasi data ribuan pelanggan)
  // Dideklarasikan di sini agar seluruh hook selalu terpanggil secara berurutan sebelum conditional return layar apapun
  const renderPelangganCard = useCallback(
    ({ item }) => {
      const isItemSelected = selectedPelangganSet.has(item.id);
      const isExpanded = expandedPelangganId === item.id;
      return (
        <View
          style={[
            styles.pelangganItemCard,
            isItemSelected && styles.pelangganItemCardSelected,
          ]}
        >
          {/* Baris 1: No. SMB & Nama Pelanggan di Baris Satu, Aksi di Kanan (Tanpa Chevron) */}
          <View style={styles.pelangganItemRow1}>
            <View style={styles.pelangganItemRow1Left}>
              {/* Tombol Ceklist per Data Pelanggan */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleSelectPelanggan(item.id)}
                style={styles.pelangganCheckboxBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isItemSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={21}
                  color={isItemSelected ? '#10B981' : '#94A3B8'}
                />
              </TouchableOpacity>

              <View style={styles.pelangganNoSmbBadge}>
                <Text style={styles.pelangganNoSmbText}>{item.noSmb || '-'}</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  if (selectedPelangganIds.length > 0) {
                    toggleSelectPelanggan(item.id);
                  } else {
                    setExpandedPelangganId(isExpanded ? null : item.id);
                  }
                }}
                style={styles.pelangganNameInlineWrapper}
              >
                <Text style={styles.pelangganItemNameInline} numberOfLines={1}>
                  {item.nama || 'Super Pelanggan'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pelangganTopActionRow}>
              {/* Tombol Add ke Daftar Tagihan (Selalu icon +, tidak berubah centang) */}
              <TouchableOpacity
                style={styles.pelangganAddBtn}
                activeOpacity={0.7}
                onPress={() => handleOpenTransferModal(item)}
              >
                <Ionicons name="add" size={16} color="#07326E" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleDeletePelanggan(item.id)}
                activeOpacity={0.7}
                style={styles.pelangganDeleteBtn}
              >
                <Ionicons name="trash-outline" size={15} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Baris 2: Alamat Pelanggan */}
          <TouchableOpacity
            activeOpacity={selectedPelangganIds.length > 0 ? 0.7 : 0.85}
            onPress={() => {
              if (selectedPelangganIds.length > 0) {
                toggleSelectPelanggan(item.id);
              } else {
                setExpandedPelangganId(isExpanded ? null : item.id);
              }
            }}
            style={styles.pelangganAddressRow}
          >
            <Text style={styles.pelangganItemAddressText} numberOfLines={2}>
              {item.alamat || '-'}
            </Text>
          </TouchableOpacity>

          {/* Detail: Titik Koordinat (Hanya muncul jika Nama Pelanggan diklik) */}
          {isExpanded && (
            <View style={styles.pelangganDetailContainer}>
              <View style={styles.pelangganDetailSection}>
                <View style={styles.pelangganCoordBox}>
                  <View style={styles.pelangganCoordIconCircle}>
                    <Ionicons name="location" size={18} color="#EF4444" />
                  </View>
                  <View style={styles.pelangganCoordTextContainer}>
                    <Text style={styles.pelangganCoordTitle}>Koordinat Terpilih</Text>
                    <Text style={styles.pelangganCoordValue}>{item.koordinat || '-'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pelangganBukaPetaBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      const clean = String(item.koordinat || '').replace(/[()]/g, '').trim();
                      if (Platform.OS === 'web') {
                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`, '_blank');
                      } else {
                        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`);
                      }
                    }}
                  >
                    <Text style={styles.pelangganBukaPetaBtnText}>Buka Maps</Text>
                    <Ionicons name="open-outline" size={12} color="#07326E" style={{ marginLeft: 3 }} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      );
    },
    [selectedPelangganSet, expandedPelangganId, selectedPelangganIds.length, toggleSelectPelanggan, handleOpenTransferModal, handleDeletePelanggan]
  );

  useEffect(() => {
    let isMounted = true;
    let subscription = null;
    let browserWatchId = null;

    async function startRealtimeTracking() {
      // Mode Web Browser
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (isMounted && pos.coords) {
              setUserLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            }
          },
          (err) => console.warn('Geolocation initial error:', err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        browserWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (isMounted && pos.coords) {
              setUserLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            }
          },
          (err) => console.warn('Geolocation watch error:', err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
        );
        return;
      }

      // Mode Native (iOS / Android)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const initialLoc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest,
          });
          if (isMounted && initialLoc && initialLoc.coords) {
            setUserLocation({
              lat: initialLoc.coords.latitude,
              lng: initialLoc.coords.longitude,
              accuracy: initialLoc.coords.accuracy,
            });
          }

          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Highest,
              timeInterval: 1500,
              distanceInterval: 1,
            },
            (loc) => {
              if (isMounted && loc && loc.coords) {
                setUserLocation({
                  lat: loc.coords.latitude,
                  lng: loc.coords.longitude,
                  accuracy: loc.coords.accuracy,
                });
              }
            }
          );
        }
      } catch (e) {
        console.warn('Location tracking error:', e);
      }
    }

    startRealtimeTracking();

    return () => {
      isMounted = false;
      if (subscription && subscription.remove) {
        subscription.remove();
      }
      if (browserWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(browserWatchId);
      }
    };
  }, []);

  // Baca jarak kordinat pelanggan dari lokasi saya sesuai rute jalan yang akan dilewati (bukan garis lurus)
  useEffect(() => {
    if (!userLocation || typeof userLocation.lat !== 'number' || typeof userLocation.lng !== 'number' || isNaN(userLocation.lat) || isNaN(userLocation.lng)) return;
    if (!daftarTagihanPelanggan || !Array.isArray(daftarTagihanPelanggan) || daftarTagihanPelanggan.length === 0) return;

    const targets = [];
    daftarTagihanPelanggan.forEach((t) => {
      if (!t) return;
      const coords = parseCustomerCoords(t);
      if (
        coords &&
        typeof coords.lat === 'number' &&
        typeof coords.lng === 'number' &&
        !isNaN(coords.lat) &&
        !isNaN(coords.lng)
      ) {
        const id = t.tagihanId || t.id;
        if (id) {
          const cacheKey = `${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}_${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
          targets.push({ id, coords, cacheKey });
        }
      }
    });

    if (targets.length === 0) return;

    const newDistMap = {};
    const toFetch = [];
    targets.forEach((item) => {
      if (roadDistanceCacheRef.current.has(item.cacheKey)) {
        newDistMap[item.id] = roadDistanceCacheRef.current.get(item.cacheKey);
      } else {
        toFetch.push(item);
      }
    });

    if (Object.keys(newDistMap).length > 0) {
      setRoadDistances((prev) => ({ ...prev, ...newDistMap }));
    }

    if (toFetch.length === 0) return;

    // Ambil maksimal 25 item agar URL OSRM tidak melampaui limit GET server
    const fetchChunk = toFetch.slice(0, 25);
    const coordsQuery = [
      `${userLocation.lng},${userLocation.lat}`,
      ...fetchChunk.map((t) => `${t.coords.lng},${t.coords.lat}`),
    ].join(';');

    const url = `https://router.project-osrm.org/table/v1/driving/${coordsQuery}?sources=0&annotations=distance`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.code === 'Ok' && data.distances && data.distances[0]) {
          const distances = data.distances[0];
          const fetchedMap = {};
          fetchChunk.forEach((t, index) => {
            const meters = distances[index + 1];
            if (typeof meters === 'number' && !isNaN(meters)) {
              const km = meters / 1000;
              fetchedMap[t.id] = km;
              roadDistanceCacheRef.current.set(t.cacheKey, km);
            }
          });
          setRoadDistances((prev) => ({ ...prev, ...fetchedMap }));
        }
      })
      .catch((err) => {
        console.warn('Gagal membaca jarak rute jalan OSRM:', err);
      });
  }, [userLocation, daftarTagihanPelanggan]);

  // Form: Daftar Tagihan
  if (currentScreen === 'daftar_tagihan') {
    const rawTagihanPeriodeIni = (daftarTagihanPelanggan || []).filter(
      (tagihan) =>
        tagihan &&
        tagihan.periodeBulan === selectedMonth &&
        String(tagihan.periodeTahun) === String(selectedYear)
    );

    // Hitung jarak sesuai rute jalan yang dilewati & urutkan pelanggan dari yang paling dekat dengan lokasi saya
    const tagihanPeriodeIni = rawTagihanPeriodeIni
      .map((tagihan) => {
        const coords = parseCustomerCoords(tagihan);
        let distanceKm = null;
        let distanceFormatted = null;

        if (
          userLocation &&
          coords &&
          typeof userLocation.lat === 'number' &&
          typeof userLocation.lng === 'number' &&
          typeof coords.lat === 'number' &&
          typeof coords.lng === 'number' &&
          !isNaN(userLocation.lat) &&
          !isNaN(userLocation.lng) &&
          !isNaN(coords.lat) &&
          !isNaN(coords.lng)
        ) {
          const tagihanKey = tagihan.tagihanId || tagihan.id;
          if (tagihanKey && roadDistances[tagihanKey] != null) {
            // Jarak rute jalan riil (bukan garis lurus)
            distanceKm = roadDistances[tagihanKey];
          } else {
            // Estimasi jarak rute jalan (faktor kelokan jalan ~1.35x garis lurus) sambil menunggu respon API
            const straightKm = getHaversineDistanceKm(
              userLocation.lat,
              userLocation.lng,
              coords.lat,
              coords.lng
            );
            distanceKm = straightKm * 1.35;
          }
          distanceFormatted = formatDistanceText(distanceKm);
        }

        return {
          ...tagihan,
          _coords: coords,
          _distanceKm: distanceKm,
          _distanceFormatted: distanceFormatted,
        };
      })
      .sort((a, b) => {
        const distA = typeof a._distanceKm === 'number' && !isNaN(a._distanceKm) ? a._distanceKm : null;
        const distB = typeof b._distanceKm === 'number' && !isNaN(b._distanceKm) ? b._distanceKm : null;
        if (distA == null && distB == null) return 0;
        if (distA == null) return 1; // Jika tidak ada koordinat ditaruh di bawah
        if (distB == null) return -1;
        return distA - distB; // Urutkan dari yang terdekat (paling atas) ke terjauh
      });

    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />

        {/* Header Navigation */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentScreen('home')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>Daftar Tagihan</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>Data input dari data pelanggan</Text>
          </View>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.formScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Periode Penagihan Aktif (Klik untuk ubah periode via Modal) */}
          <TouchableOpacity
            style={styles.activePeriodCard}
            activeOpacity={0.8}
            onPress={() => {
              setModalYear(selectedYear);
              setPeriodModalMode('view_tagihan');
              setPeriodModalVisible(true);
            }}
          >
            <View style={styles.activePeriodIconBox}>
              <Ionicons name="calendar" size={22} color="#07326E" />
            </View>
            <View style={styles.activePeriodInfo}>
              <Text style={styles.activePeriodLabel}>PERIODE PENAGIHAN AKTIF</Text>
              <Text style={styles.activePeriodValue}>
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </Text>
            </View>
            <View style={styles.activePeriodActionPill}>
              <Text style={styles.activePeriodActionText}>Ubah Periode</Text>
              <Ionicons name="chevron-forward" size={14} color="#07326E" style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>

          {/* DAFTAR TAGIHAN PELANGGAN */}
          <View style={styles.tagihanPelangganSection}>
            <View style={styles.tagihanPelangganHeaderRow}>
              <View>
                <Text style={styles.tagihanPelangganSectionTitle}>
                  DAFTAR TAGIHAN PELANGGAN
                </Text>
                <Text style={styles.tagihanPelangganSubtitle}>
                  Periode: {MONTH_NAMES[selectedMonth]} {selectedYear} ({tagihanPeriodeIni.length} Pelanggan)
                </Text>
              </View>
              <View style={styles.tagihanPelangganBadge}>
                <Text style={styles.tagihanPelangganBadgeText}>
                  {tagihanPeriodeIni.length} Tagihan
                </Text>
              </View>
            </View>

            {tagihanPeriodeIni.length === 0 ? (
              <View style={styles.tagihanEmptyBox}>
                <Ionicons name="receipt-outline" size={38} color="#94A3B8" />
                <Text style={styles.tagihanEmptyTitle}>Belum Ada Tagihan di Periode Ini</Text>
                <Text style={styles.tagihanEmptyDesc}>
                  Belum ada data pelanggan yang ditransfer ke periode {MONTH_NAMES[selectedMonth]} {selectedYear}. Tekan icon "+" pada Data Pelanggan untuk mentransfer pelanggan ke periode ini.
                </Text>
                <View style={styles.tagihanEmptyActions}>
                  <TouchableOpacity
                    style={styles.bukaDataPelangganBtn}
                    onPress={() => setCurrentScreen('data_pelanggan')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="people-outline" size={15} color="#07326E" style={{ marginRight: 6 }} />
                    <Text style={styles.bukaDataPelangganBtnText}>Buka Data Pelanggan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bukaDataPelangganBtn, { backgroundColor: '#EAF1FB', borderColor: '#BFDBFE' }]}
                    onPress={() => {
                      setModalYear(selectedYear);
                      setPeriodModalMode('view_tagihan');
                      setPeriodModalVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar-outline" size={15} color="#07326E" style={{ marginRight: 6 }} />
                    <Text style={styles.bukaDataPelangganBtnText}>Pilih Periode Lain</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.tagihanListWrap}>
                {tagihanPeriodeIni.map((tagihan, index) => {
                  const itemKey = tagihan.tagihanId || tagihan.id || `tgh-${index}`;
                  const isExpanded = expandedTagihanId === itemKey;
                  return (
                    <View key={itemKey} style={styles.pelangganItemCard}>
                      {/* Baris 1: No. SMB & Nama Pelanggan di Baris Satu, Estimasi Jarak & Hapus di Kanan (Tanpa Chevron) */}
                      <View style={styles.pelangganItemRow1}>
                        <View style={styles.pelangganItemRow1Left}>
                          <View style={styles.pelangganNoSmbBadge}>
                            <Text style={styles.pelangganNoSmbText}>{tagihan.noSmb || '-'}</Text>
                          </View>

                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setExpandedTagihanId(isExpanded ? null : itemKey)}
                            style={styles.pelangganNameInlineWrapper}
                          >
                            <Text style={styles.pelangganItemNameInline} numberOfLines={1}>
                              {tagihan.nama || 'Super Pelanggan'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.pelangganTopActionRow}>
                          {tagihan._distanceFormatted ? (
                            <View style={styles.tagihanJarakBadge}>
                              <Ionicons name="navigate" size={10} color="#047857" style={{ marginRight: 3 }} />
                              <Text style={styles.tagihanJarakText}>{tagihan._distanceFormatted}</Text>
                            </View>
                          ) : null}

                          {/* Icon Chevron dihapus untuk menghemat ruang */}

                          <TouchableOpacity
                            onPress={() => handleHapusTagihan(itemKey)}
                            activeOpacity={0.7}
                            style={styles.pelangganDeleteBtn}
                          >
                            <Ionicons name="trash-outline" size={15} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Baris 2: Alamat Pelanggan */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setExpandedTagihanId(isExpanded ? null : itemKey)}
                        style={styles.pelangganAddressRow}
                      >
                        <Text style={styles.pelangganItemAddressText} numberOfLines={2}>
                          {tagihan.alamat || '-'}
                        </Text>
                      </TouchableOpacity>

                      {/* Detail & Form Foto Persil: Muncul jika Pelanggan diklik */}
                      {isExpanded ? (
                        <View style={styles.pelangganDetailContainer}>
                          {/* Form Foto Persil Sesuai Tampilan Desain */}
                          <View style={styles.tagihanFotoPersilSection}>
                            <Text style={styles.tagihanFotoPersilTitle}>Foto Persil</Text>
                            <View style={styles.tagihanFotoPersilBtnRow}>
                              <TouchableOpacity
                                style={styles.tagihanFotoPersilBtn}
                                activeOpacity={0.8}
                                onPress={() => handleBukaKameraTagihan(itemKey)}
                              >
                                <Ionicons name="camera-outline" size={16} color="#07326E" style={{ marginRight: 6 }} />
                                <Text style={styles.tagihanFotoPersilBtnText}>Buka Kamera</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.tagihanFotoPersilBtn}
                                activeOpacity={0.8}
                                onPress={() => handleBukaGaleriTagihan(itemKey)}
                              >
                                <Ionicons name="images-outline" size={16} color="#07326E" style={{ marginRight: 6 }} />
                                <Text style={styles.tagihanFotoPersilBtnText}>Dari Galeri</Text>
                              </TouchableOpacity>
                            </View>

                            {/* Foto Persil yang sudah diambil: Hanya tampilkan foto saja tanpa keterangan apapun */}
                            {tagihan.fotoPersil ? (
                              <View style={styles.fotoPersilPreviewWrapper}>
                                <TouchableOpacity
                                  activeOpacity={0.88}
                                  onPress={() =>
                                    setSelectedPhotoFull({
                                      uri: tagihan.fotoPersil,
                                      title: `Foto Persil - ${tagihan.nama || ''} (${tagihan.noSmb || ''})`,
                                    })
                                  }
                                  style={styles.fotoPersilImageContainer}
                                >
                                  <Image
                                    source={{ uri: tagihan.fotoPersil }}
                                    style={styles.fotoPersilCleanImage}
                                    resizeMode="cover"
                                  />
                                </TouchableOpacity>

                                {/* Tombol hapus foto floating di sudut foto tanpa teks/keterangan */}
                                <TouchableOpacity
                                  onPress={() => handleHapusFotoPersilTagihan(itemKey)}
                                  activeOpacity={0.7}
                                  style={styles.fotoPersilHapusFloatingBtn}
                                >
                                  <Ionicons name="trash-outline" size={15} color="#FFFFFF" />
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>

                          {/* Titik Koordinat jika ada */}
                          {tagihan.koordinat ? (
                            <View style={[styles.pelangganDetailSection, { marginTop: 10 }]}>
                              <View style={styles.pelangganCoordBox}>
                                <View style={styles.pelangganCoordIconCircle}>
                                  <Ionicons name="location" size={18} color="#EF4444" />
                                </View>
                                <View style={styles.pelangganCoordTextContainer}>
                                  <Text style={styles.pelangganCoordTitle}>Koordinat Terpilih</Text>
                                  <Text style={styles.pelangganCoordValue}>{String(tagihan.koordinat)}</Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.pelangganBukaPetaBtn}
                                  activeOpacity={0.8}
                                  onPress={() => {
                                    const clean = String(tagihan.koordinat || '').replace(/[()]/g, '').trim();
                                    if (Platform.OS === 'web') {
                                      window.open(
                                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`,
                                        '_blank'
                                      );
                                    } else {
                                      Linking.openURL(
                                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`
                                      );
                                    }
                                  }}
                                >
                                  <Text style={styles.pelangganBukaPetaBtnText}>Buka Maps</Text>
                                  <Ionicons
                                    name="open-outline"
                                    size={12}
                                    color="#07326E"
                                    style={{ marginLeft: 3 }}
                                  />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Notice Box */}
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle-outline" size={20} color="#1E40AF" />
            <Text style={styles.noticeText}>
              Periode terpilih: {MONTH_NAMES[selectedMonth]} {selectedYear}. Menampilkan seluruh data tagihan pelanggan yang terdaftar pada periode ini.
            </Text>
          </View>

          {/* Button Kembali */}
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 14 }]}
            onPress={() => setCurrentScreen('home')}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#475569" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryBtnText}>Kembali ke Menu Utama</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Modal Pop-up Pilih Bulan & Tahun */}
        {renderPeriodPickerModal()}

        {/* Modal Pop-up Berhasil Ditambahkan */}
        {renderSuccessModal()}

        {/* Modal Fullscreen Foto Persil */}
        {renderPhotoViewerModal()}
      </SafeAreaView>
    );
  }

  // Form: Rute Tagihan Pelanggan (Google Maps Real-Time)
  if (currentScreen === 'rute_tagihan') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />

        {/* Header Navigation */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentScreen('home')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>Rute Tagihan Pelanggan</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setModalYear(selectedYear);
                setPeriodModalMode('view_rute');
                setPeriodModalVisible(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}
            >
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                Periode: {MONTH_NAMES[selectedMonth]} {selectedYear} ({rutePelanggan.length} Pelanggan)
              </Text>
              <Ionicons name="calendar-outline" size={12} color="#64748B" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.mapOnlineBadge}>
            <View style={styles.pulseGreenDot} />
            <Text style={styles.mapOnlineText}>Real-Time</Text>
          </View>
        </View>

        {/* Google Maps Container */}
        <View style={styles.mapScreenContainer}>
          <MapViewer
            userLocation={userLocation}
            customers={rutePelanggan}
            style={styles.mapViewerStyle}
          />
        </View>

        {/* Modal Pemilihan Periode (Bulan & Tahun) */}
        {renderPeriodPickerModal()}
      </SafeAreaView>
    );
  }



  // Form: Data Pelanggan (Tanpa proses apapun)
  if (currentScreen === 'data_pelanggan') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />

        {/* Header Navigation */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              setSelectedPelangganIds([]);
              setCurrentScreen('home');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>Data Pelanggan</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>Master Database Pelanggan</Text>
          </View>
        </View>

        <View style={styles.pelangganContainer}>
          {/* Search Input Bar (Identik Gambar) */}
          <View style={styles.pelangganSearchBox}>
            <Ionicons name="search" size={20} color="#60A5FA" style={styles.pelangganSearchIcon} />
            <TextInput
              style={styles.pelangganSearchInput}
              placeholder="Cari No. Sambungan atau Nama Pelanggan..."
              placeholderTextColor="#94A3B8"
              value={pelangganSearchQuery}
              onChangeText={setPelangganSearchQuery}
            />
            {pelangganSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setPelangganSearchQuery('')} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Counter Text & Tombol Ceklist Semua */}
          <View style={styles.pelangganCountRow}>
            <Text style={styles.pelangganCountText}>
              Menampilkan <Text style={styles.pelangganCountBold}>{filteredPelanggan.length}</Text> dari <Text style={styles.pelangganCountBold}>{daftarPelanggan.length}</Text> total pelanggan
            </Text>

            {filteredPelanggan.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleSelectAllPelanggan}
                style={[
                  styles.pelangganSelectAllBtn,
                  isAllPelangganSelected && styles.pelangganSelectAllBtnActive,
                ]}
              >
                <Ionicons
                  name={isAllPelangganSelected ? 'checkmark-done-circle' : 'checkmark-circle-outline'}
                  size={15}
                  color={isAllPelangganSelected ? '#10B981' : '#07326E'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.pelangganSelectAllText,
                    isAllPelangganSelected && styles.pelangganSelectAllTextActive,
                  ]}
                >
                  {isAllPelangganSelected ? 'Batal Ceklist' : 'Ceklist Semua'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List Data Pelanggan atau Empty State (Virtualisasi FlatList berkecepatan tinggi) */}
          {filteredPelanggan.length === 0 ? (
            <View style={styles.pelangganEmptyCenter}>
              {/* Circular People Avatar */}
              <View style={styles.pelangganEmptyAvatar}>
                <Ionicons name="people" size={44} color="#334155" />
              </View>

              {/* Title & Subtitle */}
              <Text style={styles.pelangganEmptyTitle}>
                {daftarPelanggan.length === 0 ? 'Belum Ada Data Pelanggan' : 'Data Tidak Ditemukan'}
              </Text>
              <Text style={styles.pelangganEmptyDesc}>
                {daftarPelanggan.length === 0
                  ? 'Tekan tombol "Tambah Pelanggan Manual" di bawah untuk menambahkan data.'
                  : 'Tidak ada data pelanggan yang cocok dengan kata kunci pencarian.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredPelanggan}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderPelangganCard}
              style={styles.pelangganListContainer}
              contentContainerStyle={styles.pelangganListContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={15}
              maxToRenderPerBatch={15}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              keyboardShouldPersistTaps="handled"
              extraData={{
                expandedPelangganId,
                selectedCount: selectedPelangganIds.length,
              }}
            />
          )}

          {/* Bar Tindakan Kolektif Pelanggan (Muncul jika ada data yang diceklist) */}
          {selectedPelangganIds.length > 0 && (
            <View style={styles.pelangganBatchBar}>
              <View style={styles.pelangganBatchLeft}>
                <View style={styles.pelangganBatchBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                  <Text style={styles.pelangganBatchBadgeText}>
                    {selectedPelangganIds.length} Terpilih
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedPelangganIds([])}
                  style={styles.pelangganBatchCancelBtn}
                >
                  <Text style={styles.pelangganBatchCancelText}>Batal</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleDeleteCollectivePelanggan}
                style={styles.pelangganBatchDeleteBtn}
              >
                <Ionicons name="trash" size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.pelangganBatchDeleteText}>
                  Hapus ({selectedPelangganIds.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom Action Buttons: Sejajar ke samping & hemat ruang */}
          <View style={styles.pelangganBottomActions}>
            {/* Button 1: Tambah Pelanggan Manual */}
            <TouchableOpacity
              style={styles.tambahPelangganBtn}
              activeOpacity={0.85}
              onPress={() => setCurrentScreen('tambah_pelanggan_manual')}
            >
              <Ionicons name="person-add-outline" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text
                style={styles.tambahPelangganBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                Tambah Pelanggan Manual
              </Text>
            </TouchableOpacity>

            {/* Button 2: Import Excel */}
            <TouchableOpacity
              style={styles.importExcelBtn}
              activeOpacity={0.85}
              onPress={handleImportExcel}
              disabled={isImportingExcel}
            >
              <Ionicons
                name={isImportingExcel ? 'hourglass-outline' : 'document-text-outline'}
                size={15}
                color="#15803D"
                style={{ marginRight: 5 }}
              />
              <Text
                style={styles.importExcelBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.75}
              >
                {isImportingExcel ? 'Mengimpor...' : 'Import Excel'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Modal Pop-up Pilih Bulan & Tahun */}
        {renderPeriodPickerModal()}

        {/* Modal Pop-up Berhasil Ditambahkan */}
        {renderSuccessModal()}
      </SafeAreaView>
    );
  }

  // Form: Tambah Pelanggan Manual (Hanya tampilan - tanpa proses apapun)
  if (currentScreen === 'tambah_pelanggan_manual') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />

        {/* Header Navigation */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentScreen('data_pelanggan')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>Tambah Pelanggan Manual</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>Input Seluruh Form</Text>
          </View>
        </View>

        <ScrollView
          style={styles.formManualScrollView}
          contentContainerStyle={styles.formManualScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Field 1: Nomor Smb (xx-xxxxx) */}
          <View style={styles.formManualGroup}>
            <Text style={styles.formManualLabel}>Nomor Smb (xx-xxxxx)</Text>
            <TextInput
              style={styles.formManualInputFull}
              placeholder="xx-xxxxx"
              placeholderTextColor="#8E9CAE"
              value={manualNomorSmb}
              onChangeText={handleNomorSmbChange}
              maxLength={8}
              keyboardType="numeric"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => namaInputRef.current?.focus()}
            />
            <Text style={styles.formManualHelperText}>
              2 Digit : Zona, 5 Digit : Nomor Reg
            </Text>
          </View>

          {/* Field 2: Nama Pelanggan */}
          <View style={styles.formManualGroup}>
            <Text style={styles.formManualLabel}>Nama Pelanggan</Text>
            <TextInput
              ref={namaInputRef}
              style={styles.formManualInputFull}
              placeholder="Masukkan nama pelanggan (opsional, default: Super Pelanggan)"
              placeholderTextColor="#8E9CAE"
              value={manualNama}
              onChangeText={setManualNama}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => alamatInputRef.current?.focus()}
            />
          </View>

          {/* Field: Alamat */}
          <View style={styles.formManualGroup}>
            <Text style={styles.formManualLabel}>Alamat</Text>
            <TextInput
              ref={alamatInputRef}
              style={styles.formManualInputFull}
              placeholder="Masukkan alamat lengkap pelanggan"
              placeholderTextColor="#8E9CAE"
              value={manualAlamat}
              onChangeText={setManualAlamat}
              returnKeyType="done"
            />
          </View>

          {/* Field: Maps Rumah (Beralih Langsung ke Google Maps) */}
          <View style={styles.formManualGroup}>
            <Text style={styles.formManualLabel}>Maps Rumah</Text>
            <TouchableOpacity
              style={[styles.formManualAlamatCard, manualCoords && styles.formManualAlamatCardActive]}
              activeOpacity={0.85}
              onPress={() => {
                setCurrentScreen('pilih_titik_alamat');
              }}
            >
              <View style={styles.formManualPinCircle}>
                <Ionicons name="location-sharp" size={22} color="#EF4444" />
              </View>
              <View style={styles.formManualAlamatTextContainer}>
                <Text style={styles.formManualAlamatTitle}>
                  {manualCoords ? 'Koordinat Terpilih' : 'Pilih Alamat'}
                </Text>
                <Text style={styles.formManualAlamatSubtitle}>
                  {manualCoords
                    ? `GPS: ${manualCoords} (Ketuk untuk ubah pin)`
                    : 'Buka Google Maps & geser pin ke rumah'}
                </Text>
              </View>
              <Ionicons
                name={manualCoords ? 'checkmark-circle' : 'chevron-forward'}
                size={18}
                color={manualCoords ? '#16A34A' : '#475569'}
              />
            </TouchableOpacity>
          </View>

          {/* Bottom Action Button: Simpan Data Pelanggan */}
          <TouchableOpacity
            style={styles.formManualSimpanBtn}
            activeOpacity={0.88}
            onPress={handleSimpanPelanggan}
          >
            <Text style={styles.formManualSimpanBtnText}>Simpan Data Pelanggan</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Screen: Pilih Titik Alamat Rumah (Google Maps dengan Pin Geser)
  if (currentScreen === 'pilih_titik_alamat') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" backgroundColor="#FFFFFF" />

        {/* Header Navigation */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setCurrentScreen('tambah_pelanggan_manual')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>Pilih Titik Rumah</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {tempPickerCoords
                ? `GPS: ${tempPickerCoords.lat.toFixed(6)}, ${tempPickerCoords.lng.toFixed(6)}`
                : 'Geser pin ke titik rumah pelanggan'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerGunakanBtn}
            activeOpacity={0.8}
            onPress={() => {
              const target = tempPickerCoords || userLocation || { lat: -7.1539, lng: 112.6561 };
              setManualCoords(`${target.lat.toFixed(6)}, ${target.lng.toFixed(6)}`);
              setCurrentScreen('tambah_pelanggan_manual');
            }}
          >
            <Text style={styles.headerGunakanBtnText}>Pilih</Text>
          </TouchableOpacity>
        </View>

        {/* Interactive Google Maps Picker */}
        <View style={styles.mapScreenContainer}>
          <MapPicker
            initialCoords={
              manualCoords
                ? {
                  lat: parseFloat(manualCoords.split(',')[0]) || -7.1539,
                  lng: parseFloat(manualCoords.split(',')[1]) || 112.6561,
                }
                : userLocation || { lat: -7.1539, lng: 112.6561 }
            }
            onSelectCoords={(lat, lng, isConfirm) => {
              setTempPickerCoords({ lat, lng });
              if (isConfirm) {
                setManualCoords(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                setCurrentScreen('tambah_pelanggan_manual');
              }
            }}
            style={styles.mapViewerStyle}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Dashboard Utama
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card: Greeting & Status Info */}
        <View style={styles.greetingCard}>
          <Text style={styles.greetingTitle}>DASHBOARD</Text>
          <Text style={styles.greetingSubtitle}>
            Input daftar tagihan dari data pelanggan, pastikan rute tagihan sudah akurat dan Mulai Tagihan.
          </Text>
        </View>

        {/* Section: Menu Utama */}
        <Text style={styles.sectionLabel}>MENU UTAMA</Text>

        {/* Main Action Card: Mulai Tagihan */}
        <TouchableOpacity
          activeOpacity={0.88}
          style={styles.heroCard}
          onPress={() => setModalVisible(true)}
        >
          <View style={styles.heroTopRow}>
            {/* Rocket Badge */}
            <View style={styles.rocketBadge}>
              <Text style={styles.rocketEmoji}>🚀</Text>
            </View>

            {/* Title & Description */}
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>Mulai Tagihan</Text>
              <Text style={styles.heroDescription}>
                Pilih periode tagihan, kelola daftar tagihan &amp; buat rute pengantaran optimal
              </Text>
            </View>

            {/* Action Circle Button */}
            <View style={styles.arrowButton}>
              <Ionicons name="arrow-forward" size={20} color="#0A3871" />
            </View>
          </View>
        </TouchableOpacity>

        {/* Section: Menu Kelola & Tindak Lanjut */}
        <Text style={styles.sectionLabel}>MENU KELOLA &amp; TINDAK LANJUT</Text>

        {/* Card 1: Data Pelanggan */}
        <TouchableOpacity
          style={styles.actionCard}
          activeOpacity={0.85}
          onPress={() => setCurrentScreen('data_pelanggan')}
        >
          <View style={[styles.cardIconBox, { backgroundColor: '#EBF3FE' }]}>
            <Ionicons name="people" size={26} color="#334155" />
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Data Pelanggan</Text>
              <View style={[styles.badgePill, { backgroundColor: '#EAF1FB' }]}>
                <Text style={[styles.badgeText, { color: '#3B82F6' }]}>{daftarPelanggan.length} Data</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Daftar lengkap master pelanggan, titik koordinat GPS &amp; tambah pelanggan baru
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={styles.cardChevron} />
        </TouchableOpacity>

        {/* Card 2: SPK TS */}
        <View style={styles.actionCard}>
          <View style={[styles.cardIconBox, { backgroundColor: '#FEF6E4' }]}>
            <Ionicons name="warning" size={26} color="#F59E0B" />
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Pelanggan TS</Text>
              <View style={[styles.badgePill, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.badgeText, { color: '#B45309' }]}>Tutup Sementara</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Surat perintah kerja tutup sementara
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={styles.cardChevron} />
        </View>

        {/* Card 3: Janji Bayar */}
        <View style={styles.actionCard}>
          <View style={[styles.cardIconBox, { backgroundColor: '#E6F9F0' }]}>
            <Text style={{ fontSize: 24 }}>🤝</Text>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Pembukaan TS</Text>
              <View style={[styles.badgePill, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.badgeText, { color: '#15803D' }]}>Lunas</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              Pembukaan segel &amp; berita acara eksekusi
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color="#94A3B8" style={styles.cardChevron} />
        </View>
      </ScrollView>

      {/* Modal Pemilihan: Daftar Tagihan & Rute Tagihan Pelanggan */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <View style={styles.modalHandle} />

            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Mulai Tagihan</Text>
                <Text style={styles.modalSubtitle}>Pilih formulir penagihan yang ingin dibuka:</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Opsi 1: Form Daftar Tagihan */}
            <TouchableOpacity
              style={styles.modalOptionCard}
              activeOpacity={0.8}
              onPress={() => {
                setModalVisible(false);
                setModalYear(selectedYear);
                setPeriodModalMode('view_tagihan');
                setPeriodModalVisible(true);
              }}
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: '#EBF3FE' }]}>
                <Ionicons name="receipt-outline" size={24} color="#07326E" />
              </View>
              <View style={styles.modalOptionContent}>
                <Text style={styles.modalOptionTitle}>Daftar Tagihan</Text>
                <Text style={styles.modalOptionDesc}>
                  Lihat dan kelola rekapitulasi data tagihan pelanggan
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>

            {/* Opsi 2: Form Rute Tagihan Pelanggan */}
            <TouchableOpacity
              style={styles.modalOptionCard}
              activeOpacity={0.8}
              onPress={() => {
                setModalVisible(false);
                setModalYear(selectedYear);
                setPeriodModalMode('view_rute');
                setPeriodModalVisible(true);
              }}
            >
              <View style={[styles.modalOptionIcon, { backgroundColor: '#E6F9F0' }]}>
                <MaterialCommunityIcons name="google-maps" size={26} color="#15803D" />
              </View>
              <View style={styles.modalOptionContent}>
                <Text style={styles.modalOptionTitle}>Rute Tagihan Pelanggan</Text>
                <Text style={styles.modalOptionDesc}>
                  Pemetaan jalur pengantaran dan urutan kunjungan pelanggan
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Pop-up Pilih Bulan & Tahun */}
      {renderPeriodPickerModal()}

      {/* Modal Pop-up Berhasil Ditambahkan */}
      {renderSuccessModal()}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 60,
  },

  /* Greeting / Top Header Card */
  greetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
      },
    }),
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  greetingSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#64748B',
    fontWeight: '400',
  },

  /* Section Labels */
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  /* Hero Blue Card (Mulai Tagihan) */
  heroCard: {
    backgroundColor: '#07326E',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#07326E',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 8px 24px rgba(7, 50, 110, 0.3)',
      },
    }),
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rocketBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rocketEmoji: {
    fontSize: 26,
  },
  heroTextContainer: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  heroDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '400',
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
      },
    }),
  },

  /* Action Cards (Data Pelanggan, SPK TS, Janji Bayar) */
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 3px 8px rgba(15, 23, 42, 0.03)',
      },
    }),
  },
  cardIconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  badgePill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    fontWeight: '400',
  },
  cardChevron: {
    marginLeft: 4,
  },

  /* Form & Navigation Header */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  formScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 60,
  },

  /* Form Banner Card */
  formBannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 3px 8px rgba(15, 23, 42, 0.03)',
      },
    }),
  },
  formBannerIconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formBannerTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  formBadge: {
    backgroundColor: '#EAF1FB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  formBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#3B82F6',
  },
  formBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  formBannerDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },

  /* Static Form Section */
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 3px 8px rgba(15, 23, 42, 0.03)',
      },
    }),
  },
  formSectionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  fieldBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    fontSize: 13.5,
    color: '#1E293B',
    fontWeight: '500',
  },

  /* Notice Box */
  noticeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginTop: 6,
  },
  noticeText: {
    fontSize: 12,
    color: '#1E40AF',
    marginLeft: 10,
    flex: 1,
    lineHeight: 17,
  },

  /* Secondary Button (Kembali) */
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
  },

  /* Modal Bottom Sheet */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 44 : 36,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  modalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptionContent: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  modalOptionDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },

  /* Period Picker Card (Identik dengan Gambar) */
  periodPickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 6px 20px rgba(15, 23, 42, 0.05)',
      },
    }),
  },
  pickerAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EBF2FC',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  calendarMiniCard: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
      },
    }),
  },
  calendarMiniHeader: {
    backgroundColor: '#EF4444',
    height: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarMiniHeaderText: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  calendarMiniBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  calendarMiniBodyText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
    marginTop: -1,
  },
  pickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  yearCapsule: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  yearNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  yearCenterCol: {
    alignItems: 'center',
  },
  yearLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  yearValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 14,
  },
  monthHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  currentMonthBadge: {
    backgroundColor: '#EAF1FB',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 10,
  },
  currentMonthBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E40AF',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  monthCell: {
    width: '31%',
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthCellSelected: {
    backgroundColor: '#07326E',
    borderColor: '#07326E',
  },
  monthCellText: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#334155',
  },
  monthCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  monthActiveDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#FFFFFF',
    marginTop: 3,
  },

  /* Google Maps Screen */
  mapScreenContainer: {
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  mapViewerStyle: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mapOnlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  pulseGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 5,
  },
  mapOnlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },

  /* Data Pelanggan Screen (Identik Gambar) */
  pelangganContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 12 : 16,
    backgroundColor: '#FFFFFF',
  },
  pelangganSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  pelangganSearchIcon: {
    marginRight: 10,
  },
  pelangganSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 3,
  },
  pelangganCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  pelangganCountText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 2,
  },
  pelangganCountBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  pelangganSelectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pelangganSelectAllBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  pelangganSelectAllText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#07326E',
  },
  pelangganSelectAllTextActive: {
    color: '#047857',
    fontWeight: '700',
  },
  pelangganEmptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    marginTop: -40,
  },
  pelangganEmptyAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 18,
  },
  pelangganEmptyTitle: {
    fontSize: 18.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  pelangganEmptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 310,
  },
  pelangganBottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: Platform.OS === 'android' ? 4 : 2,
  },
  tambahPelangganBtn: {
    flex: 1.15,
    height: 42,
    backgroundColor: '#07326E',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#07326E',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 6px rgba(7, 50, 110, 0.2)',
      },
    }),
  },
  tambahPelangganBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  importExcelBtn: {
    flex: 0.85,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#86EFAC',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#15803D',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 4px rgba(21, 128, 61, 0.08)',
      },
    }),
  },
  importExcelBtnText: {
    color: '#15803D',
    fontSize: 11.5,
    fontWeight: '700',
  },

  /* Styles Form Tambah Pelanggan Manual */
  formManualScrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  formManualScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 60,
  },
  formManualGroup: {
    marginBottom: 24,
  },
  formManualLabel: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  formManualNomorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formManualInputSmall: {
    width: 96,
    height: 58,
    backgroundColor: '#E6EDF5',
    borderRadius: 18,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  formManualDash: {
    fontSize: 22,
    color: '#475569',
    marginHorizontal: 12,
    fontWeight: '600',
  },
  formManualInputLarge: {
    flex: 1,
    height: 58,
    backgroundColor: '#E6EDF5',
    borderRadius: 18,
    paddingHorizontal: 18,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  formManualHelperText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
    marginLeft: 2,
  },
  formManualInputFull: {
    height: 58,
    backgroundColor: '#E6EDF5',
    borderRadius: 18,
    paddingHorizontal: 18,
    fontSize: 15,
    color: '#0F172A',
  },
  formManualFotoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formManualFotoBtn: {
    flex: 1,
    height: 58,
    backgroundColor: '#E6EDF5',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formManualFotoEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  formManualFotoBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A3871',
  },
  formManualAlamatCard: {
    backgroundColor: '#E6EDF5',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  formManualPinCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D9E5F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formManualAlamatTextContainer: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  formManualAlamatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A3871',
    letterSpacing: -0.2,
  },
  formManualAlamatSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  formManualSimpanBtn: {
    backgroundColor: '#07326E',
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#07326E',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(7, 50, 110, 0.25)',
      },
    }),
  },
  formManualSimpanBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  formManualFotoBtnActive: {
    borderWidth: 1.5,
    borderColor: '#07326E',
    backgroundColor: '#DBEAFE',
  },
  formManualAlamatCardActive: {
    borderWidth: 1.5,
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },

  /* Styles List Data Pelanggan */
  pelangganListContainer: {
    flex: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  pelangganListContent: {
    paddingBottom: 10,
    gap: 7,
  },
  pelangganItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
      },
    }),
  },
  pelangganItemCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F7FEFA',
  },
  pelangganCheckboxBtn: {
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pelangganBatchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1.2,
    borderColor: '#FECACA',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 5,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.12)',
      },
    }),
  },
  pelangganBatchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pelangganBatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  pelangganBatchBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  pelangganBatchCancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  pelangganBatchCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  pelangganBatchDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 5px rgba(239, 68, 68, 0.2)',
      },
    }),
  },
  pelangganBatchDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pelangganItemRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pelangganItemRow1Left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pelangganItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pelangganItemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pelangganHeaderClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pelangganNoSmbBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF1FB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  pelangganNoSmbText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#07326E',
  },
  pelangganNameInlineWrapper: {
    flex: 1,
    marginLeft: 8,
  },
  pelangganItemNameInline: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  pelangganAddressRow: {
    marginTop: 4,
  },
  pelangganNameBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  pelangganItemNameFull: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  tagihanJarakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 4,
  },
  tagihanJarakText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  pelangganTopActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagihanCardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tagihanCardLeftContent: {
    flex: 1,
    marginRight: 10,
  },
  tagihanCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagihanCardRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  tagihanJarakBadgeUnderTrash: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  pelangganChevronBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pelangganDeleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pelangganItemAddressText: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 5,
  },

  /* Detail Dropdown Styles */
  pelangganDetailContainer: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  pelangganDetailSection: {
    marginBottom: 12,
  },
  pelangganDetailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pelangganDetailLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  pelangganDetailBadge: {
    backgroundColor: '#EAF1FB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  pelangganDetailBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#07326E',
  },
  pelangganFotoWrapper: {
    width: '100%',
    height: 145,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginTop: 4,
    position: 'relative',
  },
  pelangganFotoImage: {
    width: '100%',
    height: '100%',
  },
  pelangganFotoOverlayBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pelangganFotoOverlayText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pelangganCoordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  pelangganCoordIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pelangganCoordTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  pelangganCoordTitle: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  pelangganCoordValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  pelangganBukaPetaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF1FB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pelangganBukaPetaBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#07326E',
  },

  /* Form Foto Persil pada Daftar Tagihan */
  tagihanFotoPersilSection: {
    marginBottom: 4,
    marginTop: 2,
  },
  tagihanFotoPersilTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  tagihanFotoPersilBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagihanFotoPersilBtn: {
    flex: 1,
    height: 38,
    backgroundColor: '#EAF1FB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D4E2F6',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tagihanFotoPersilBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#07326E',
  },

  /* Foto Persil Bersih Tanpa Keterangan */
  fotoPersilPreviewWrapper: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginTop: 10,
    position: 'relative',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  fotoPersilImageContainer: {
    width: '100%',
    height: '100%',
  },
  fotoPersilCleanImage: {
    width: '100%',
    height: '100%',
  },
  fotoPersilHapusFloatingBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
      },
    }),
  },

  /* Preview Foto Persil pada Form */
  formManualPreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
  },
  formManualFotoThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  formManualPreviewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  formManualPreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  formManualPreviewBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  formManualHapusFotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formManualHapusFotoText: {
    fontSize: 11.5,
    color: '#EF4444',
    fontWeight: '600',
  },
  formManualFotoThumbWrap: {
    position: 'relative',
  },
  previewZoomBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(7, 50, 110, 0.85)',
    borderRadius: 5,
    padding: 2.5,
  },
  previewKlikLihatText: {
    fontSize: 11,
    color: '#07326E',
    fontWeight: '600',
    marginBottom: 5,
  },

  /* Modal Fullscreen Foto Persil */
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  photoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    zIndex: 10,
  },
  photoModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  photoModalSubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  photoModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  photoModalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  photoModalFullImage: {
    width: '100%',
    height: '100%',
  },
  photoModalBottomBar: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  photoModalBottomText: {
    fontSize: 11.5,
    color: '#CBD5E1',
  },
  headerGunakanBtn: {
    backgroundColor: '#07326E',
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  headerGunakanBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Tombol Add pada Data Pelanggan */
  pelangganAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EAF1FB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pelangganAddBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },

  /* Styles Section Tagihan Pelanggan */
  tagihanPelangganSection: {
    marginTop: 18,
    marginBottom: 10,
  },
  tagihanPelangganHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tagihanPelangganSectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  tagihanPelangganSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  tagihanPelangganBadge: {
    backgroundColor: '#EAF1FB',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagihanPelangganBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#07326E',
  },
  tagihanEmptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  tagihanEmptyTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 4,
  },
  tagihanEmptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
    marginBottom: 14,
  },
  bukaDataPelangganBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bukaDataPelangganBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#07326E',
  },
  tagihanListWrap: {
    gap: 7,
  },
  tagihanItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
      },
    }),
  },
  tagihanItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tagihanStatusPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 'auto',
    marginRight: 8,
  },
  tagihanStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  tagihanDeleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagihanItemName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  tagihanItemAddress: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  tagihanDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 10,
  },
  tagihanMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagihanMetaCol: {
    flex: 1,
  },
  tagihanMetaColRight: {
    alignItems: 'flex-end',
  },
  tagihanMetaLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  tagihanMetaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  tagihanAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#07326E',
  },

  /* Modal Pop-up Periode Bulan & Tahun */
  periodModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  periodModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 12px 30px -5px rgba(15, 23, 42, 0.22), 0 8px 10px -6px rgba(15, 23, 42, 0.12)',
      },
    }),
  },
  periodModalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  /* Banner Periode Aktif pada Layar Daftar Tagihan */
  activePeriodCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
      },
    }),
  },
  activePeriodIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EAF1FB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activePeriodInfo: {
    flex: 1,
  },
  activePeriodLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  activePeriodValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#07326E',
  },
  activePeriodActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activePeriodActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#07326E',
  },
  tagihanEmptyActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },

  /* Segmented Tabs di Daftar Tagihan */
  tagihanTabSegment: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagihanTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  tagihanTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)',
      },
    }),
  },
  tagihanTabBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tagihanTabBtnTextActive: {
    color: '#07326E',
    fontWeight: '800',
  },

  /* Banner Shortcut Rute Tagihan */
  bukaRuteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF3FE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  bukaRuteIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#07326E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bukaRuteBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#07326E',
  },
  bukaRuteBannerDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },

  /* Rute Tagihan di dalam Daftar Tagihan */
  tagihanMapCard: {
    height: 340,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    marginBottom: 18,
    backgroundColor: '#E2E8F0',
  },
  tagihanMapViewer: {
    flex: 1,
  },
  ruteSequenceTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  ruteItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  ruteIndexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#07326E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  ruteIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  ruteNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07326E',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  ruteNavBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },

  /* Modal Pop-up "Berhasil Ditambahkan" */
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  successModalCard: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0 16px 36px -6px rgba(15, 23, 42, 0.25)',
      },
    }),
  },
  successModalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#BBF7D0',
  },
  successModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  successModalMessage: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  successModalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  successModalSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  successModalSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  successModalPrimaryBtn: {
    flex: 1.2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#07326E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
