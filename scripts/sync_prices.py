#!/usr/bin/env python3
"""
============================================================================
sync_prices.py v3 - סנכרון מחירים + בניית inverted index
============================================================================

שינויים גרסה 3:
  - בנייה של inverted index לטוקנים (מילה → מוצרים מכילים)
  - העלאת האינדקס ל-KV ב-key 'index:tokens'
  - האינדקס מאפשר ל-Worker לצמצם חיפוש מ-100K השוואות ל-~50

שינויים גרסה 2:
  - מעבר ל-kagglehub (ספרייה עדכנית במקום kaggle הישנה)
  - זיהוי רשת לפי שם קובץ (יותר אמין מחיפוש בעמודה)
  - תמיכה ב-CSV, JSON, וגם XML דחוס (GZ)
  - סינון חכם: עד 20MB לרשת, עם עדיפות למוצרים פופולריים

Environment Variables Required:
  - KAGGLE_USERNAME, KAGGLE_KEY    (גם kagglehub משתמשת בהם)
  - CLOUDFLARE_ACCOUNT_ID
  - CLOUDFLARE_API_TOKEN
  - KV_NAMESPACE_ID
============================================================================
"""

import os
import re
import sys
import json
import time
import gzip
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timezone

import requests


# ============================================================================
# קבועים
# ============================================================================

DATASET_NAME = 'erlichsefi/israeli-supermarkets-2024'

# מזהי רשתות לפי ChainId (ב-ID רשמי) + זיהוי לפי שם קובץ/תיקיה
TARGET_CHAINS = {
    'shufersal': {
        'name': 'שופרסל',
        'chain_id': '7290027600007',
        'keywords': ['shufersal', 'שופרסל'],
    },
    'ramilevi': {
        'name': 'רמי לוי',
        'chain_id': '7290058140886',
        'keywords': ['ramilevi', 'rami', 'רמי', 'לוי'],
    },
    'yeinotbitan': {
        'name': 'יינות ביתן',
        'chain_id': '7290725900003',
        'keywords': ['yeinotbitan', 'bitan', 'ביתן'],
    },
    'victory': {
        'name': 'ויקטורי',
        'chain_id': '7290696200003',
        'keywords': ['victory', 'ויקטורי'],
    },
    'yohananof': {
        'name': 'יוחננוף',
        'chain_id': '7290100700006',
        'keywords': ['yohananof', 'yohanan', 'יוחנן', 'יוחננוף'],
    },
}

# מגבלות גודל
MAX_BYTES_PER_CHAIN = 20 * 1024 * 1024   # 20MB - טווח ביטחון מ-25MB של Cloudflare KV
MAX_PRODUCTS_PER_CHAIN = 50000           # תקרה קשיחה

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

    def info(self, msg): self.log(msg, 'INFO')
    def warn(self, msg): self.log(msg, 'WARN')
    def error(self, msg): self.log(msg, 'ERROR')

    def save_report(self, path='sync_report.txt'):
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(self.messages))
        except Exception as e:
            print(f'Could not save report: {e}', flush=True)


logger = Logger()


# ============================================================================
# אימות משתני סביבה
# ============================================================================

def validate_env():
    missing = []
    if not CF_ACCOUNT_ID: missing.append('CLOUDFLARE_ACCOUNT_ID')
    if not CF_API_TOKEN: missing.append('CLOUDFLARE_API_TOKEN')
    if not KV_NAMESPACE_ID: missing.append('KV_NAMESPACE_ID')
    if not os.environ.get('KAGGLE_USERNAME'): missing.append('KAGGLE_USERNAME')
    if not os.environ.get('KAGGLE_KEY'): missing.append('KAGGLE_KEY')

    if missing:
        logger.error(f'חסרים משתני סביבה: {", ".join(missing)}')
        return False
    return True


# ============================================================================
# הורדה מ-Kaggle באמצעות kagglehub (הספרייה החדשה)
# ============================================================================

def download_dataset():
    logger.info(f'מוריד dataset: {DATASET_NAME}')
    try:
        import kagglehub
        path = kagglehub.dataset_download(DATASET_NAME)
        logger.info(f'הורדה הצליחה. תיקייה: {path}')
        return Path(path)
    except Exception as e:
        logger.error(f'הורדה נכשלה: {type(e).__name__}: {e}')
        return None


# ============================================================================
# סריקת קבצים - מוצא את כל הקבצים הרלוונטיים
# ============================================================================

def find_all_data_files(directory):
    """מוצא את כל הקבצים שאנחנו יכולים לקרוא מהם"""
    directory = Path(directory)

    extensions = ['*.csv', '*.json', '*.jsonl', '*.xml', '*.gz']
    all_files = []

    for ext in extensions:
        all_files.extend(directory.rglob(ext))

    logger.info(f'סה"כ נמצאו {len(all_files)} קבצים בתיקייה')

    # דוגמאות לכמה קבצים בשביל לבנות אינטואיציה על המבנה
    if all_files:
        logger.info('דוגמאות קבצים (עד 10 ראשונים):')
        for f in all_files[:10]:
            size_kb = f.stat().st_size / 1024
            logger.info(f'  {f.relative_to(directory)} ({size_kb:.0f}KB)')

    return all_files


# ============================================================================
# זיהוי רשת לפי נתיב הקובץ (Gemini suggestion)
# ============================================================================

def detect_chain_from_path(file_path):
    """מנסה לזהות לאיזו רשת שייך הקובץ ע"פ השם/נתיב"""
    path_str = str(file_path).lower()

    for chain_key, chain_info in TARGET_CHAINS.items():
        # חיפוש לפי ChainId (ברקוד של הרשת - יחודי ואמין מאוד)
        if chain_info['chain_id'] in path_str:
            return chain_key

        # חיפוש לפי מילות מפתח בשם הקובץ
        for keyword in chain_info['keywords']:
            if keyword.lower() in path_str:
                return chain_key

    return None


# ============================================================================
# פתיחה והתמודדות עם פורמטים שונים
# ============================================================================

def open_file_smart(file_path):
    """פותח קובץ - אם GZ, מפענח. מחזיר תוכן string"""
    try:
        if file_path.suffix == '.gz':
            with gzip.open(file_path, 'rt', encoding='utf-8', errors='replace') as f:
                return f.read()
        else:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                return f.read()
    except Exception as e:
        logger.warn(f'כשל בקריאת {file_path.name}: {e}')
        return None


# ============================================================================
# פרסור נתוני מחירים - גמיש, מתאים לכל פורמט
# ============================================================================

def parse_csv_content(content):
    """מפרסר תוכן CSV ומחזיר מילון barcode -> {name, price}"""
    import csv
    import io

    products = {}
    try:
        reader = csv.DictReader(io.StringIO(content))
        for row in reader:
            barcode = extract_field(row, ['ItemCode', 'itemCode', 'barcode', 'Barcode', 'item_code', 'code'])
            name = extract_field(row, ['ItemName', 'itemName', 'name', 'Name', 'item_name', 'description', 'ItemDesc'])
            price = extract_price(row)

            if barcode and price and name:
                products[str(barcode)] = {
                    'n': name[:60],  # קיצור שם לחיסכון מקום
                    'p': round(float(price), 2),
                }
    except Exception as e:
        logger.warn(f'פרסור CSV נכשל: {e}')

    return products


def parse_xml_content(content):
    """מפרסר XML של חוק שקיפות המחיר"""
    try:
        import xml.etree.ElementTree as ET
    except ImportError:
        return {}

    products = {}
    try:
        # ה-XML של חוק המחיר לרוב מתחיל ב-<Root> או <Prices>
        root = ET.fromstring(content)

        # מחפשים תגיות Item בכל עומק
        items = root.findall('.//Item') or root.findall('.//Product') or root.findall('.//item')

        for item in items:
            barcode = get_xml_text(item, ['ItemCode', 'itemCode', 'Barcode'])
            name = get_xml_text(item, ['ItemName', 'itemName', 'ManufacturerItemDescription'])
            price = get_xml_text(item, ['ItemPrice', 'itemPrice', 'Price'])

            if barcode and price and name:
                try:
                    price_num = float(price)
                    products[str(barcode)] = {
                        'n': name[:60],
                        'p': round(price_num, 2),
                    }
                except (ValueError, TypeError):
                    continue
    except Exception as e:
        logger.warn(f'פרסור XML נכשל: {e}')

    return products


def extract_field(row, possible_keys):
    """מחלץ שדה ממילון לפי רשימת מפתחות אפשריים"""
    for key in possible_keys:
        if key in row and row[key]:
            return str(row[key]).strip()
        # ניסיון case-insensitive
        for k in row.keys():
            if k and k.lower() == key.lower() and row[k]:
                return str(row[k]).strip()
    return None


def extract_price(row):
    """מחלץ מחיר - תומך במספר שמות עמודה"""
    price_keys = ['ItemPrice', 'itemPrice', 'price', 'Price', 'item_price']
    for key in price_keys:
        val = extract_field(row, [key])
        if val:
            try:
                price = float(val)
                if 0 < price < 10000:  # מסננים מחירים לא סבירים
                    return price
            except (ValueError, TypeError):
                continue
    return None


def get_xml_text(element, tag_names):
    """מחזיר טקסט של תת-element ב-XML"""
    for tag in tag_names:
        found = element.find(tag)
        if found is not None and found.text:
            return found.text.strip()
        # חיפוש case-insensitive
        for child in element:
            if child.tag.lower() == tag.lower() and child.text:
                return child.text.strip()
    return None


def parse_file(file_path):
    """מפרסר קובץ יחיד ומחזיר מילון מוצרים"""
    content = open_file_smart(file_path)
    if not content:
        return {}

    # זיהוי פורמט לפי התוכן/סיומת
    suffix = file_path.suffix.lower().replace('.gz', '')
    if suffix == '.gz':
        # אחרי פתיחת GZ - נבדוק את ה-suffix הפנימי
        if '.xml' in file_path.name.lower():
            return parse_xml_content(content)
        elif '.csv' in file_path.name.lower():
            return parse_csv_content(content)
        # ניחוש לפי התוכן
        if content.strip().startswith('<'):
            return parse_xml_content(content)
        return parse_csv_content(content)

    if suffix == '.csv':
        return parse_csv_content(content)
    elif suffix == '.xml':
        return parse_xml_content(content)

    return {}


# ============================================================================
# סינון חכם - לעמידה במגבלת 20MB
# ============================================================================

def filter_products_by_size(products, max_bytes=MAX_BYTES_PER_CHAIN):
    """
    מצמצם מספר מוצרים כדי להישאר מתחת לגודל המקסימלי.

    עדיפות:
    1. ברקודים סטנדרטיים 13 ספרות (EAN-13) - מוצרים ארוזים
    2. שמות קצרים יותר (פחות בזבוז מקום)
    3. מחירים סבירים (1-1000 ש"ח)
    """
    if not products:
        return {}

    # חישוב גודל ראשוני
    current_size = len(json.dumps(products, ensure_ascii=False).encode('utf-8'))

    if current_size <= max_bytes:
        return products  # הכל נכנס

    logger.warn(f'גודל {current_size / 1024 / 1024:.1f}MB > {max_bytes / 1024 / 1024:.0f}MB - מסנן...')

    # דירוג מוצרים לפי "איכות"
    def priority_score(item):
        barcode, data = item
        score = 0

        # ברקוד 13 ספרות = מוצר ארוז = עדיפות גבוהה
        if barcode.isdigit():
            if len(barcode) == 13:
                score += 100
            elif len(barcode) == 8:  # EAN-8
                score += 50
            elif 10 <= len(barcode) <= 14:
                score += 30

        # שם קצר = פחות מקום
        name_len = len(data.get('n', ''))
        if name_len > 0:
            score += max(0, 60 - name_len)

        # מחיר הגיוני
        price = data.get('p', 0)
        if 1 < price < 1000:
            score += 20

        return score

    # מיון מעדיפות גבוהה לנמוכה
    sorted_items = sorted(products.items(), key=priority_score, reverse=True)

    # לקיחה עד שמגיעים לגודל המטרה
    filtered = {}
    size_so_far = 2  # לסוגריים {}

    for barcode, data in sorted_items:
        entry_size = len(json.dumps({barcode: data}, ensure_ascii=False).encode('utf-8')) + 1
        if size_so_far + entry_size > max_bytes:
            break
        filtered[barcode] = data
        size_so_far += entry_size

        if len(filtered) >= MAX_PRODUCTS_PER_CHAIN:
            break

    kept_pct = 100 * len(filtered) / len(products) if products else 0
    logger.info(f'סונן: {len(filtered)}/{len(products)} ({kept_pct:.0f}%) - {size_so_far / 1024 / 1024:.1f}MB')

    return filtered


# ============================================================================
# עיבוד מלא - סורק קבצים, מקבץ לפי רשת, מסנן
# ============================================================================

def process_all_files(all_files):
    """
    מעבד את כל הקבצים:
    1. מזהה לאיזו רשת שייך כל קובץ
    2. אוסף את כל המוצרים לפי רשת
    3. מסנן כל רשת למגבלת הגודל
    """
    by_chain = {chain: {} for chain in TARGET_CHAINS.keys()}
    files_per_chain = {chain: 0 for chain in TARGET_CHAINS.keys()}
    unmatched_files = 0

    for file_path in all_files:
        chain = detect_chain_from_path(file_path)

        if chain is None:
            unmatched_files += 1
            continue

        # פרסור הקובץ
        products = parse_file(file_path)

        if products:
            # מיזוג למילון של הרשת (אם מחיר מעודכן - דורס)
            by_chain[chain].update(products)
            files_per_chain[chain] += 1

    logger.info(f'קבצים לא זוהו לאף רשת: {unmatched_files}')

    # סיכום
    logger.info('')
    logger.info('סיכום לפני סינון:')
    for chain_key, products in by_chain.items():
        files_count = files_per_chain[chain_key]
        logger.info(f'  {TARGET_CHAINS[chain_key]["name"]}: {files_count} קבצים, {len(products)} מוצרים')

    # סינון לגודל
    logger.info('')
    logger.info('מסנן לגודל המטרה...')
    filtered = {}
    for chain_key, products in by_chain.items():
        if products:
            filtered[chain_key] = filter_products_by_size(products)
        else:
            filtered[chain_key] = {}

    return filtered


# ============================================================================
# בניית Inverted Index (לחיפוש מהיר ב-Worker)
# ============================================================================

# מגבלות ובטיחות
MAX_INDEX_BYTES = 20 * 1024 * 1024   # 20MB - שולי ביטחון מ-25MB של KV
INDEX_MIN_TOKEN_LEN = 2               # טוקנים קצרים יותר לא נכנסים לאינדקס
INDEX_MAX_PRODUCTS_PER_TOKEN = 500    # תקרה - אם יותר, הטוקן כללי מדי


def normalize_for_index(text):
    """
    נורמליזציה זהה לזו שב-Worker (worker.js → normalize).
    חיוני לעקביות בין האינדקס לבין החיפוש בזמן אמת.
    """
    if not text:
        return ''
    s = str(text).lower()
    # מסיר גרשיים
    s = re.sub(r'[״"\']', '', s)
    # רווחים כפולים
    s = re.sub(r'\s+', ' ', s)
    # אחידות יחידות מידה
    s = re.sub(r'\bליטר\b|\bליט\b|\bl\b', 'ל', s)
    s = re.sub(r"\bגרם\b|\bג'\b|\bgr\b|\bg\b", 'ג', s)
    s = re.sub(r'\bקילו\b|\bק"ג\b|\bkg\b', 'קג', s)
    s = re.sub(r'\bמ"ל\b|\bml\b', 'מל', s)
    s = re.sub(r'אחוז|%', '%', s)
    return s.strip()


def tokenize_for_index(text):
    """מפצל לטוקנים. תואם ל-tokenize של ה-Worker."""
    normalized = normalize_for_index(text)
    raw_tokens = re.split(r'[\s\-_.,()/]+', normalized)
    return [t for t in raw_tokens if len(t) >= INDEX_MIN_TOKEN_LEN]


def build_inverted_index(data):
    """
    בונה inverted index:
        { token: { chain: [product_index, ...] } }

    chain = mzhir 'shufersal' / 'ramilevi' / ...
    product_index = האינדקס של המוצר במערך כפי שייווצר ב-Worker
                    (אחרי המרת dict → list עם Object.keys() iteration order)

    הערה חשובה: סדר האיטרציה של dict ב-Python 3.7+ הוא insertion order,
    וכך גם ב-V8 ב-Cloudflare Workers - שני הצדדים יקבלו אותו סדר.

    מסירים טוקנים יקרים מדי (מופיעים ביותר מ-INDEX_MAX_PRODUCTS_PER_TOKEN
    מוצרים) - אלה כלליים מדי ולא יעילים בסינון.

    אם הגודל הסופי חורג מ-MAX_INDEX_BYTES, מחזיר None ו-Worker
    יחזור לחיפוש לינארי.
    """
    logger.info('')
    logger.info('בונה inverted index...')

    index = {}  # token -> { chain -> [indices] }

    for chain_key, products in data.items():
        if not products:
            continue

        # סדר האינדקסים תואם לסדר של Object.keys ב-JavaScript
        for product_index, (barcode, item) in enumerate(products.items()):
            name = item.get('n', '')
            if not name:
                continue

            tokens = set(tokenize_for_index(name))
            for token in tokens:
                if token not in index:
                    index[token] = {}
                if chain_key not in index[token]:
                    index[token][chain_key] = []
                index[token][chain_key].append(product_index)

    # ניקוי טוקנים יקרים מדי (כלליים מדי, לא תורמים לסינון)
    removed_tokens = 0
    tokens_to_remove = []
    for token, chains_map in index.items():
        total = sum(len(lst) for lst in chains_map.values())
        if total > INDEX_MAX_PRODUCTS_PER_TOKEN:
            tokens_to_remove.append(token)
    for t in tokens_to_remove:
        del index[t]
        removed_tokens += 1

    logger.info(f'  טוקנים ייחודיים: {len(index)}')
    logger.info(f'  טוקנים שהוסרו (יותר מ-{INDEX_MAX_PRODUCTS_PER_TOKEN} מוצרים): {removed_tokens}')

    # בדיקת גודל
    serialized = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    size_bytes = len(serialized.encode('utf-8'))
    size_mb = size_bytes / (1024 * 1024)

    logger.info(f'  גודל אינדקס: {size_mb:.2f}MB')

    if size_bytes > MAX_INDEX_BYTES:
        logger.warn(f'  ⚠️ אינדקס חורג מ-{MAX_INDEX_BYTES / (1024*1024):.0f}MB - ידלג על העלאה')
        logger.warn('  ה-Worker ימשיך לעבוד עם חיפוש לינארי')
        return None

    return index


# ============================================================================
# שליחה ל-Cloudflare KV
# ============================================================================

def put_kv_value(key, value):
    # קריאת משתני סביבה בזמן אמת + ניקוי אגרסיבי של כל תו לא תקני
    account_id = ''.join(c for c in os.environ.get('CLOUDFLARE_ACCOUNT_ID', '') if c.isprintable() and c not in ' \t\n\r')
    api_token = ''.join(c for c in os.environ.get('CLOUDFLARE_API_TOKEN', '') if c.isprintable() and c not in ' \t\n\r')
    namespace_id = ''.join(c for c in os.environ.get('KV_NAMESPACE_ID', '') if c.isprintable() and c not in ' \t\n\r')

    url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}'

    headers = {
        'Authorization': f'Bearer {api_token}',
        'Content-Type': 'application/json',
    }

    if isinstance(value, (dict, list)):
        body = json.dumps(value, ensure_ascii=False)
    else:
        body = str(value)

    body_bytes = body.encode('utf-8')
    size_kb = len(body_bytes) / 1024

    try:
        response = requests.put(url, headers=headers, data=body_bytes, timeout=60)
        if response.status_code == 200:
            logger.info(f'  ✓ {key}: {size_kb:.0f}KB')
            return True
        else:
            logger.error(f'  ✗ {key}: {response.status_code} - {response.text[:300]}')
            return False
    except Exception as e:
        logger.error(f'  ✗ {key}: {type(e).__name__}: {e}')
        return False


def upload_to_kv(data, index=None):
    uploaded = 0
    failed = 0

    # אבחון - בדיקה שה-env variables נקיים
    raw_token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    raw_account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
    raw_kv = os.environ.get('KV_NAMESPACE_ID', '')

    logger.info(f'Account ID אורך: {len(raw_account)} (מצופה: 32)')
    logger.info(f'API Token אורך: {len(raw_token)}')
    logger.info(f'KV Namespace ID אורך: {len(raw_kv)} (מצופה: 32)')

    # בדיקת תווים לא תקניים
    def check_chars(name, value):
        bad_chars = [c for c in value if not c.isprintable() or c in '\n\r\t']
        if bad_chars:
            logger.warn(f'{name}: נמצאו {len(bad_chars)} תווים לא תקינים - ינוקו')

    check_chars('Account ID', raw_account)
    check_chars('API Token', raw_token)
    check_chars('KV Namespace ID', raw_kv)

    meta = {
        'lastSync': datetime.now(timezone.utc).isoformat(),
        'chains': {},
        'source': DATASET_NAME,
        'has_index': index is not None,
    }

    logger.info('')
    logger.info('מעלה ל-Cloudflare KV...')

    for chain_key, products in data.items():
        if not products:
            logger.warn(f'דילוג על {chain_key} - אין מוצרים')
            continue

        key = f'prices:{chain_key}'

        if put_kv_value(key, products):
            uploaded += 1
            meta['chains'][chain_key] = {
                'name': TARGET_CHAINS[chain_key]['name'],
                'products': len(products),
                'updated': datetime.now(timezone.utc).isoformat(),
            }
        else:
            failed += 1

    # העלאת inverted index (אם נבנה בהצלחה)
    if index is not None:
        logger.info('')
        logger.info('מעלה inverted index...')
        if put_kv_value('index:tokens', index):
            logger.info('  ✅ אינדקס הועלה')
        else:
            logger.warn('  ⚠️ העלאת אינדקס נכשלה - Worker ימשיך עם חיפוש לינארי')
            meta['has_index'] = False

    # מטא
    if put_kv_value('meta:sync', meta):
        logger.info('מטא-מידע נשמר')

    return uploaded, failed


# ============================================================================
# Main
# ============================================================================

def main():
    logger.info('=' * 70)
    logger.info('מתחיל סנכרון מחירים v2 (kagglehub)')
    logger.info('=' * 70)

    if not validate_env():
        sys.exit(1)

    try:
        # שלב 1: הורדה
        dataset_path = download_dataset()
        if not dataset_path:
            logger.error('הורדה נכשלה')
            sys.exit(1)

        # שלב 2: סריקה
        all_files = find_all_data_files(dataset_path)
        if not all_files:
            logger.error('לא נמצאו קבצי נתונים')
            sys.exit(1)

        # שלב 3: עיבוד
        data = process_all_files(all_files)

        total_products = sum(len(p) for p in data.values())
        if total_products == 0:
            logger.error('לא נמצאו מוצרים באף רשת - בדוק את הזיהוי')
            sys.exit(1)

        logger.info('')
        logger.info(f'סה"כ {total_products} מוצרים מוכנים לעלות')

        # שלב 4: בניית inverted index
        index = build_inverted_index(data)

        # שלב 5: העלאה (מוצרים + אינדקס)
        uploaded, failed = upload_to_kv(data, index)

        logger.info('')
        logger.info('=' * 70)
        logger.info(f'✅ הסתיים: {uploaded} רשתות עלו, {failed} נכשלו')
        logger.info('=' * 70)

        return 0 if failed == 0 and uploaded > 0 else 1

    except Exception as e:
        logger.error(f'שגיאה כללית: {type(e).__name__}: {e}')
        import traceback
        for line in traceback.format_exc().splitlines():
            logger.error(line)
        return 1

    finally:
        logger.save_report()


if __name__ == '__main__':
    sys.exit(main())
