import bcrypt
from datetime import datetime, timedelta
from typing import Optional
import asyncpg

from .models import User

class UserRepository:
    """Repository for user management operations."""
    
    def __init__(self, db_connection):
        self.db = db_connection
    
    async def create_user(self, username: str, password: str) -> Optional[User]:
        """Create a new user."""
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        async with self.db.pool.acquire() as conn:
            try:
                row = await conn.fetchrow('''
                    INSERT INTO users (username, password_hash)
                    VALUES ($1, $2)
                    RETURNING id, username, password_hash, created_at, is_active
                ''', username, password_hash)
                
                return User(**dict(row))
            except asyncpg.UniqueViolationError:
                return None
    
    async def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow('''
                SELECT id, username, password_hash, created_at, is_active
                FROM users WHERE id = $1 AND is_active = TRUE
            ''', user_id)
            
            if row:
                return User(**dict(row))
            return None

    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """Authenticate user and return user data."""
        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow('''
                SELECT id, username, password_hash, created_at, is_active
                FROM users WHERE username = $1 AND is_active = TRUE
            ''', username)
            
            if row and bcrypt.checkpw(password.encode('utf-8'), row['password_hash'].encode('utf-8')):
                return User(**dict(row))
            return None
    
