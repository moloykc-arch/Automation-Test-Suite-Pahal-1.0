import psycopg2
import pandas as pd

print("\n🚀 Starting database + CSV validation...")

# CSV file path (update this path if needed)
CSV_FILE = r"C:\Users\reena.py_simadvisory\Downloads\file\10_record.csv"

# Target part info
TARGET_COUNTRY = "HONG KONG"
TARGET_PART_NUMBER = "0100-3399-04"
FULL_CODE = f"{TARGET_COUNTRY}-{TARGET_PART_NUMBER}"

try:
    # Step 1: Read CSV file
    print(f"📂 Reading CSV file: {CSV_FILE}")
    df = pd.read_csv(CSV_FILE, sep='|')

    # Step 2: Filter CSV for the required part + country
    target_row = df[
        (df["part_number"].astype(str).str.strip() == TARGET_PART_NUMBER)
        & (df["country"].astype(str).str.strip().str.upper() == TARGET_COUNTRY)
    ]

    if target_row.empty:
        print(f"❌ No matching record found in CSV for {FULL_CODE}")
    else:
        csv_annual_volume = str(target_row.iloc[0]["annual_volume"]).strip()
        print(f"📄 CSV Annual Volume for {FULL_CODE}: {csv_annual_volume}")

        # Step 3: Connect to Database
        connection = psycopg2.connect(
            host="127.0.0.1",
            port="5472",
            database="china_dbu_dev",
            user="china_app",
            password="admin@china_app"
        )
        cursor = connection.cursor()
        print("✅ Connected to database china_dbu_dev")

        # Step 4: Fetch DB annual_volume
        query = """
        SELECT annual_volume
        FROM china.list_pricing
        WHERE code = %s;
        """
        cursor.execute(query, (FULL_CODE,))
        result = cursor.fetchone()

        if not result:
            print(f"❌ No record found in DB for code '{FULL_CODE}'")
        else:
            db_annual_volume = str(result[0]).strip()
            print(f"🗄️ DB Annual Volume for {FULL_CODE}: {db_annual_volume}")

            # Step 5: Compare CSV vs DB values
            if csv_annual_volume == db_annual_volume:
                print(f"✅ PASS: Annual Volume matches ({csv_annual_volume})")
            else:
                print(f"❌ FAIL: Mismatch for {FULL_CODE}")
                print(f"   → CSV annual_volume: {csv_annual_volume}")
                print(f"   → DB annual_volume : {db_annual_volume}")

except Exception as e:
    print("❌ Error:", e)

finally:
    if 'cursor' in locals():
        cursor.close()
    if 'connection' in locals():
        connection.close()
    print("🔒 Database connection closed.")

print("✅ Validation completed successfully.")
