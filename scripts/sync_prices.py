#!/usr/bin/env python3
"""
============================================================================
sync_prices.py - סנכרון מחירים מ-Kaggle ל-Cloudflare KV
============================================================================

תהליך:
  1. מוריד דאטה סט עדכני מ-Kaggle
  2. מפרק CSV/JSON
  3. מסנן 5 רשתות גדולות
  4. דוחס לפורמט קומפקטי
  5. שולח ל-Cloudflare KV דרך API

Environment Variables Required:
  - KAGGLE_USERNAME, KAGGLE_KEY   (מוגדר ב-~/.kaggle/kaggle.json)
  - CLOUDFLARE_ACCOUNT_ID
  - CLOUDFLARE_API_TOKEN
  - KV_NAMESPACE_ID                (של SALI_PRICES)

Usage:
  python scripts/sync_prices.py
============================================================================
"""

import os
import sys
import json
import time
import zipfile
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

import requests
from kaggle.api.kaggle_api_extended import KaggleApi


# ============================================================================
# קבועים
# ============================================================================

# רשימת ה-datasets הפוטנציאליים ב-Kaggle - ננסה אותם בסדר
KAGGLE_DATASETS_TO_TRY = [
    'erlichsefi/israeli-supermarkets',
    'erlichsefi/israeli-supermarket-prices',
    'openisraeli/israeli-supermarkets',
]

# רשתות יעד - רק אלה נשמרות ב-KV (חוסך מקום)
TARGET_CHAINS = {
    '7290027600007': 'shufersal',
    '7290058140886': 'ramilevi',
    '7290725900003': 'yeinotbitan',
    '7290696200003': 'victory',
    '7290100700006': 'yohananof',
}

# Cloudflare API
CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
KV_NAMESPACE_ID = os.environ.get('KV_NAMESPACE_ID', '').strip()

CF_API_BASE = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}'


# ============================================================================
# לוג מובנה
# ============================================================================

class Logger:
    def __init__(self):
        self.messages = []
        self.start_time = time.time()

    def log(self, message, level='INFO'):
        elapsed = time.time() - self.start_time
        line = f'[{level}] [{elapsed:6.1f}s] {message}'
        print(line, flush=True)
        self.messages.append(line)

    def info(self, msg):
        self.log(msg, 'INFO')

    def warn(self, msg):
        self.log(msg, 'WARN')

    def error(self, msg):
        self.log(msg, 'ERROR')

    def save_report(self, path='sync_report.txt'):
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(self.messages))


logger = Logger()


# ============================================================================
# אימות משתני סביבה
# ============================================================================

def validate_env():
    """וודא שכל המשתנים קיימים"""
    missing = []
    if not CF_ACCOUNT_ID:
        missing.append('CLOUDFLARE_ACCOUNT_ID')
    if not CF_API_TOKEN:
        missing.append('CLOUDFLARE_API_TOKEN')
    if not KV_NAMESPACE_ID:
        missing.append('KV_NAMESPACE_ID')

    if missing:
        logger.error(f'חסרים משתני סביבה: {", ".join(missing)}')
        return False

    kaggle_json = Path.home() / '.kaggle' / 'kaggle.json'
    if not kaggle_json.exists():
        logger.error('~/.kaggle/kaggle.json לא קיים')
        return False

    return True


# ============================================================================
# הורדה מ-Kaggle
# ============================================================================

def download_from_kaggle(output_dir):
    """מנסה להוריד מ-Kaggle. מחזיר את שם ה-dataset שהצליח"""

    try:
        api = KaggleApi()
        api.authenticate()
    except Exception as e:
        logger.error(f'אימות Kaggle נכשל: {e}')
        return None

    for dataset_name in KAGGLE_DATASETS_TO_TRY:
        logger.info(f'מנסה להוריד: {dataset_name}')
        try:
            api.dataset_download_files(
                dataset_name,
                path=output_dir,
                unzip=True,
                quiet=False,
            )
            logger.info(f'הורדה הצליחה: {dataset_name}')
            return dataset_name
        except Exception as e:
            logger.warn(f'נכשל: {e}')
            continue

    logger.error('כל ה-datasets נכשלו')
    return None


# ============================================================================
# פרסור הדאטה
# ============================================================================

def find_price_files(directory):
    """מחפש קבצי מחירים בתיקיה (CSV, JSON)"""
    directory = Path(directory)

    # רשימה של extensions פוטנציאליים
    csv_files = list(directory.rglob('*.csv'))
    json_files = list(directory.rglob('*.json'))

    logger.info(f'נמצאו {len(csv_files)} קבצי CSV, {len(json_files)} קבצי JSON')

    return csv_files, json_files


def parse_csv_file(csv_path):
    """פרסור קובץ CSV של מחירים"""
    import csv as csv_module

    items = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                items.append(row)
    except Exception as e:
        logger.warn(f'פרסור {csv_path.name} נכשל: {e}')
        return []

    return items


def extract_chain_from_row(row):
    """מנסה לזהות איזו רשת מהשורה - ע"פ שמות שדות אפשריים"""
    possible_fields = ['ChainId', 'chain_id', 'chainid', 'ChainID', 'chain']
    for field in possible_fields:
        if field in row and row[field]:
            val = str(row[field]).strip()
            if val in TARGET_CHAINS:
                return TARGET_CHAINS[val]
    return None


def extract_price(row):
    """מחלץ מחיר מהשורה"""
    possible_fields = ['ItemPrice', 'price', 'Price', 'item_price']
    for field in possible_fields:
        if field in row and row[field]:
            try:
                return float(row[field])
            except (ValueError, TypeError):
                continue
    return None


def extract_barcode(row):
    """מחלץ ברקוד"""
    possible_fields = ['ItemCode', 'barcode', 'Barcode', 'item_code']
    for field in possible_fields:
        if field in row and row[field]:
            return str(row[field]).strip()
    return None


def extract_name(row):
    """מחלץ שם מוצר"""
    possible_fields = ['ItemName', 'name', 'Name', 'item_name', 'ManufacturerItemDescription']
    for field in possible_fields:
        if field in row and row[field]:
            return str(row[field]).strip()
    return None


def process_all_data(csv_files):
    """
    עיבוד כל הקבצים ובניית מבנה:
    {
      chain_id: {
        barcode: { name, price, last_updated }
      }
    }
    """
    data = {chain: {} for chain in TARGET_CHAINS.values()}
    stats = {chain: 0 for chain in TARGET_CHAINS.values()}
    total_rows = 0

    for csv_file in csv_files:
        logger.info(f'מעבד: {csv_file.name}')
        rows = parse_csv_file(csv_file)

        for row in rows:
            total_rows += 1

            chain = extract_chain_from_row(row)
            if not chain:
                continue  # לא מהרשתות שלנו

            barcode = extract_barcode(row)
            price = extract_price(row)
            name = extract_name(row)

            if not barcode or not price:
                continue

            data[chain][barcode] = {
                'name': name or '',
                'price': price,
            }
            stats[chain] += 1

    logger.info(f'סה"כ {total_rows} שורות נבדקו')
    for chain, count in stats.items():
        logger.info(f'  {chain}: {count} מוצרים')

    return data


# ============================================================================
# שליחה ל-Cloudflare KV
# ============================================================================

def put_kv_value(key, value):
    """שולח ערך ל-KV של Cloudflare"""
    url = f'{CF_API_BASE}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/{key}'
    headers = {
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/json',
    }

    # אם value הוא dict/list - נמיר ל-JSON string
    if isinstance(value, (dict, list)):
        body = json.dumps(value, ensure_ascii=False)
    else:
        body = str(value)

    try:
        response = requests.put(url, headers=headers, data=body.encode('utf-8'), timeout=30)
        if response.status_code == 200:
            return True
        else:
            logger.warn(f'PUT {key} failed: {response.status_code} - {response.text[:200]}')
            return False
    except Exception as e:
        logger.error(f'PUT {key} exception: {e}')
        return False


def upload_to_kv(data):
    """מעלה את הדאטה ל-KV. מפצל לפי רשת למניעת קבצים גדולים מדי (KV limit: 25MB)"""

    uploaded = 0
    failed = 0

    # מפתח מטא - מידע כללי
    meta = {
        'lastSync': datetime.utcnow().isoformat() + 'Z',
        'chains': {},
    }

    for chain_name, products in data.items():
        if not products:
            logger.warn(f'דילוג על {chain_name} - אין נתונים')
            continue

        # מפתח לפי רשת
        key = f'prices:{chain_name}'

        logger.info(f'מעלה {chain_name}: {len(products)} מוצרים...')

        if put_kv_value(key, products):
            uploaded += 1
            meta['chains'][chain_name] = {
                'products': len(products),
                'updated': datetime.utcnow().isoformat() + 'Z',
            }
        else:
            failed += 1

    # מעלה את המטא
    if put_kv_value('meta:sync', meta):
        logger.info('מטא-מידע נשמר')

    return uploaded, failed


# ============================================================================
# Main
# ============================================================================

def main():
    logger.info('=' * 60)
    logger.info('מתחיל סנכרון מחירים')
    logger.info('=' * 60)

    # אימות
    if not validate_env():
        sys.exit(1)

    # יצירת תיקיה זמנית
    temp_dir = tempfile.mkdtemp(prefix='prices_')
    logger.info(f'תיקיה זמנית: {temp_dir}')

    try:
        # שלב 1: הורדה
        dataset_used = download_from_kaggle(temp_dir)
        if not dataset_used:
            logger.error('אף dataset לא הצליח. בדוק את השם ב-Kaggle.')
            sys.exit(1)

        # שלב 2: חיפוש קבצים
        csv_files, json_files = find_price_files(temp_dir)

        if not csv_files and not json_files:
            logger.error('לא נמצאו קבצי נתונים')
            sys.exit(1)

        # שלב 3: עיבוד
        data = process_all_data(csv_files)

        total_products = sum(len(p) for p in data.values())
        if total_products == 0:
            logger.error('לא נמצאו מוצרים מהרשתות המבוקשות')
            sys.exit(1)

        logger.info(f'סה"כ {total_products} מוצרים מוכנים לעלות')

        # שלב 4: העלאה
        uploaded, failed = upload_to_kv(data)

        logger.info('=' * 60)
        logger.info(f'✅ הסתיים: {uploaded} רשתות עלו, {failed} נכשלו')
        logger.info('=' * 60)

        return 0 if failed == 0 else 1

    finally:
        # ניקוי
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.save_report()


if __name__ == '__main__':
    sys.exit(main())
