#!/usr/bin/env python3
"""
Database Reset Script
Drops all tables and recreates them with the new schema.
Use this when you want a completely fresh start.
"""
import os
import asyncio
import asyncpg
import sys

async def reset_database():
    """Drop all existing tables and recreate with new schema."""
    db_url = os.getenv("DATABASE_URL", "postgresql://research_user:research_password@localhost/research_frames")
    
    try:
        # Connect to database
        conn = await asyncpg.connect(db_url)
        
        print("🗑️  Dropping all existing tables...")
        
        # Drop tables in correct order (considering foreign key constraints)
        tables_to_drop = [
            'pdf_summaries',
 
            'frames',
            'user_tokens',
            'user_contexts',
            'pdfs',
            'notes',
            'user_pdfs',  # Old table if it exists
            'users'
        ]
        
        for table in tables_to_drop:
            try:
                await conn.execute(f'DROP TABLE IF EXISTS {table} CASCADE')
                print(f"   ✅ Dropped table: {table}")
            except Exception as e:
                print(f"   ⚠️  Could not drop {table}: {e}")
        
        # Also drop any remaining constraints
        print("\n🔧 Cleaning up constraints and indexes...")
        try:
            await conn.execute('DROP INDEX IF EXISTS idx_users_username CASCADE')
            await conn.execute('DROP INDEX IF EXISTS idx_notes_user_id CASCADE')
            await conn.execute('DROP INDEX IF EXISTS idx_pdfs_user_id CASCADE')
            await conn.execute('DROP INDEX IF EXISTS idx_frames_user_id CASCADE')
            print("   ✅ Cleaned up indexes")
        except Exception as e:
            print(f"   ⚠️  Index cleanup: {e}")
        
        await conn.close()
        
        print("\n✨ Database reset complete!")
        print("🔄 Now restart your backend server to recreate tables with the new schema.")
        
    except Exception as e:
        print(f"❌ Error resetting database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("🚨 WARNING: This will DELETE ALL DATA in the database!")
    print("Are you sure you want to continue? (type 'yes' to confirm)")
    
    confirmation = input().strip().lower()
    if confirmation == 'yes':
        asyncio.run(reset_database())
    else:
        print("❌ Database reset cancelled.")