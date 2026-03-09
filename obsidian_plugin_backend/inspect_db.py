#!/usr/bin/env python3
"""
Simple database inspection script for prototyping.
Shows table schemas, data counts, and recent entries.
"""

import asyncio
import asyncpg
import os
import json
from datetime import datetime

async def inspect_database():
    """Inspect the current database state."""
    db_url = os.getenv("DATABASE_URL", "postgresql://research_user:research_password@localhost/research_frames")
    
    print("=" * 60)
    print("DATABASE INSPECTION")
    print("=" * 60)
    print(f"Database: {db_url}")
    print()
    
    try:
        conn = await asyncpg.connect(db_url)
        
        # Get all tables
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        """)
        
        if not tables:
            print("❌ No tables found in database")
            return
            
        for table in tables:
            table_name = table['table_name']
            await inspect_table(conn, table_name)
            print()
        
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
    finally:
        if 'conn' in locals():
            await conn.close()

async def inspect_table(conn, table_name):
    """Inspect a specific table."""
    print(f"📊 TABLE: {table_name}")
    print("-" * 40)
    
    # Get column information
    columns = await conn.fetch("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
    """, table_name)
    
    print("Columns:")
    for col in columns:
        nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
        default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
        print(f"  • {col['column_name']}: {col['data_type']} {nullable}{default}")
    
    # Get row count
    count = await conn.fetchval(f'SELECT COUNT(*) FROM {table_name}')
    print(f"\nRow count: {count}")
    
    if count > 0:
        # Show sample data for small tables or recent entries for larger ones
        if count <= 10:
            print(f"\nAll {count} rows:")
            rows = await conn.fetch(f'SELECT * FROM {table_name} ORDER BY id')
        else:
            print(f"\nMost recent 5 rows:")
            # Try to order by id or created_at
            order_column = 'id'
            column_names = [col['column_name'] for col in columns]
            if 'created_at' in column_names:
                order_column = 'created_at'
            rows = await conn.fetch(f'SELECT * FROM {table_name} ORDER BY {order_column} DESC LIMIT 5')
        
        for row in rows:
            row_data = dict(row)
            # Format datetime objects
            for key, value in row_data.items():
                if isinstance(value, datetime):
                    row_data[key] = value.strftime("%Y-%m-%d %H:%M:%S")
            
            print(f"  {json.dumps(row_data, indent=2)}")

if __name__ == "__main__":
    asyncio.run(inspect_database())