import os
import uuid
import hashlib
import shutil
from typing import List, Optional, Dict, Any
from pathlib import Path
import aiofiles
from fastapi import UploadFile

class PDFManager:
    """Manages PDF file storage and operations"""
    
    def __init__(self, storage_dir: str = "pdf_storage"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        
        # Create user subdirectories structure
        self.users_dir = self.storage_dir / "users"
        self.users_dir.mkdir(exist_ok=True)
        
        # Max file size: 50MB
        self.max_file_size = 50 * 1024 * 1024
        
        # Allowed MIME types
        self.allowed_types = {
            'application/pdf',
            'application/x-pdf'
        }
    
    def _get_user_dir(self, user_id: int) -> Path:
        """Get or create user-specific directory"""
        user_dir = self.users_dir / str(user_id)
        user_dir.mkdir(exist_ok=True)
        return user_dir
    
    def _generate_filename(self, original_filename: str) -> str:
        """Generate a unique filename while preserving extension"""
        # Extract extension and ensure it's .pdf
        file_ext = Path(original_filename).suffix.lower()
        if file_ext != '.pdf':
            file_ext = '.pdf'
        
        # Generate unique filename (always use .pdf, don't duplicate)
        unique_id = str(uuid.uuid4())
        return f"{unique_id}.pdf"
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of file for deduplication"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    async def save_uploaded_pdf(self, user_id: int, file: UploadFile) -> Dict[str, Any]:
        """Save an uploaded PDF file"""
        # Validate file type
        if file.content_type not in self.allowed_types:
            raise ValueError(f"Invalid file type: {file.content_type}. Only PDF files are allowed.")
        
        # Check file size
        content = await file.read()
        if len(content) > self.max_file_size:
            raise ValueError(f"File too large: {len(content)} bytes. Maximum allowed: {self.max_file_size} bytes.")
        
        # Reset file position
        await file.seek(0)
        
        # Generate unique filename
        filename = self._generate_filename(file.filename or "uploaded.pdf")
        user_dir = self._get_user_dir(user_id)
        file_path = user_dir / filename
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        
        # Calculate file hash for deduplication
        file_hash = self._calculate_file_hash(file_path)
        
        return {
            'filename': filename,
            'original_filename': file.filename or "uploaded.pdf",
            'file_path': str(file_path),
            'file_size': len(content),
            'file_hash': file_hash
        }

    async def save_vault_pdf(self, user_id: int, vault_pdf_path: str, pdf_content: bytes) -> Dict[str, Any]:
        """Save a PDF from Obsidian vault content to user storage"""
        print(f"🔍 DEBUG: Saving PDF from vault path: {vault_pdf_path}")
        print(f"🔍 DEBUG: PDF content size: {len(pdf_content)} bytes")
        
        # Validate PDF content size
        if len(pdf_content) > self.max_file_size:
            raise ValueError(f"PDF too large: {len(pdf_content)} bytes. Maximum allowed: {self.max_file_size} bytes.")
        
        # Extract original filename from vault path
        original_filename = Path(vault_pdf_path).name
        print(f"🔍 DEBUG: Original filename: {original_filename}")
        
        # Validate it's a PDF by extension (basic check)
        if not original_filename.lower().endswith('.pdf'):
            raise ValueError(f"File is not a PDF: {vault_pdf_path}")
        
        # Generate unique filename for storage
        filename = self._generate_filename(original_filename)
        user_dir = self._get_user_dir(user_id)
        file_path = user_dir / filename
        
        print(f"🔍 DEBUG: Storing PDF at: {file_path}")
        
        # Save PDF content
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(pdf_content)
        
        # Calculate file hash
        file_hash = self._calculate_file_hash(file_path)
        
        print(f"✅ DEBUG: PDF saved successfully: {filename}")
        
        return {
            'filename': filename,
            'original_filename': original_filename,
            'file_path': str(file_path),
            'file_size': len(pdf_content),
            'file_hash': file_hash
        }
    
    def copy_vault_pdf(self, user_id: int, vault_pdf_path: str) -> Dict[str, Any]:
        """Copy a PDF from Obsidian vault to user storage"""
        print(f"🔍 DEBUG: Attempting to copy PDF from vault path: {vault_pdf_path}")
        vault_path = Path(vault_pdf_path)
        print(f"🔍 DEBUG: Resolved Path object: {vault_path}")
        print(f"🔍 DEBUG: Path exists: {vault_path.exists()}")
        print(f"🔍 DEBUG: Path is absolute: {vault_path.is_absolute()}")
        
        # Validate file exists and is PDF
        if not vault_path.exists():
            # If not absolute, try to find it in common vault locations
            cwd = Path.cwd()
            print(f"🔍 DEBUG: Current working directory: {cwd}")
            
            # Common Obsidian vault locations relative to backend
            possible_paths = [
                cwd / vault_pdf_path,  # Current working directory
                cwd / ".." / vault_pdf_path,  # Parent directory  
                cwd / "../.." / vault_pdf_path,  # Two levels up
                cwd / "../../.." / vault_pdf_path,  # Three levels up (for plugin in .obsidian/plugins/name/)
                cwd / "../development" / vault_pdf_path,  # Common vault location: ../development/
                cwd / "../../development" / vault_pdf_path,  # Two levels up to development/
                cwd / "../../../development" / vault_pdf_path,  # Three levels up to development/
                # Also try without the extra 'development' in case it's directly in obsidian/
                cwd / ".." / ".." / vault_pdf_path,  # Direct parent of obsidian_plugin_backend
            ]
            
            found_path = None
            for possible_path in possible_paths:
                absolute_path = possible_path.resolve()
                print(f"🔍 DEBUG: Trying path: {absolute_path}")
                if absolute_path.exists():
                    found_path = absolute_path
                    break
            
            if found_path:
                vault_path = found_path
                print(f"✅ DEBUG: Found PDF at: {vault_path}")
            else:
                print(f"❌ DEBUG: PDF not found in any of the attempted paths")
                print(f"🔍 DEBUG: Searched paths:")
                for p in possible_paths:
                    print(f"  - {p.resolve()}")
                raise FileNotFoundError(f"PDF file not found: {vault_pdf_path}")
        
        if vault_path.suffix.lower() != '.pdf':
            raise ValueError(f"File is not a PDF: {vault_pdf_path}")
        
        # Check file size
        file_size = vault_path.stat().st_size
        if file_size > self.max_file_size:
            raise ValueError(f"File too large: {file_size} bytes. Maximum allowed: {self.max_file_size} bytes.")
        
        # Generate unique filename
        filename = self._generate_filename(vault_path.name)
        user_dir = self._get_user_dir(user_id)
        file_path = user_dir / filename
        
        # Copy file
        shutil.copy2(vault_path, file_path)
        
        # Calculate file hash
        file_hash = self._calculate_file_hash(file_path)
        
        return {
            'filename': filename,
            'original_filename': vault_path.name,
            'file_path': str(file_path),
            'file_size': file_size,
            'file_hash': file_hash
        }
    
    def delete_pdf_file(self, file_path: str) -> bool:
        """Delete a PDF file from storage"""
        try:
            path = Path(file_path)
            if path.exists() and path.is_file():
                path.unlink()
                
                # Clean up empty user directory if no files left
                user_dir = path.parent
                if user_dir.exists() and not any(user_dir.iterdir()):
                    user_dir.rmdir()
                
                return True
        except Exception as e:
            print(f"Error deleting PDF file {file_path}: {e}")
        
        return False
    
    def get_file_info(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Get information about a PDF file"""
        try:
            path = Path(file_path)
            if path.exists() and path.is_file():
                stat = path.stat()
                return {
                    'file_path': str(path),
                    'file_size': stat.st_size,
                    'created_at': stat.st_ctime,
                    'modified_at': stat.st_mtime,
                    'exists': True
                }
        except Exception as e:
            print(f"Error getting file info for {file_path}: {e}")
        
        return {'exists': False}
    
    # Removed list_vault_pdfs method - PDF scanning now handled in frontend
    
    def validate_pdf_file(self, file_path: str) -> bool:
        """Validate that a file is a valid PDF"""
        try:
            path = Path(file_path)
            if not path.exists() or not path.is_file():
                return False
            
            # Check file extension
            if path.suffix.lower() != '.pdf':
                return False
            
            # Check PDF magic bytes
            with open(path, 'rb') as f:
                header = f.read(5)
                return header == b'%PDF-'
        except Exception:
            return False
    
    def get_storage_stats(self, user_id: int) -> Dict[str, Any]:
        """Get storage statistics for a user"""
        user_dir = self._get_user_dir(user_id)
        
        total_files = 0
        total_size = 0
        
        try:
            for pdf_file in user_dir.glob("*.pdf"):
                if pdf_file.is_file():
                    total_files += 1
                    total_size += pdf_file.stat().st_size
        except Exception as e:
            print(f"Error calculating storage stats for user {user_id}: {e}")
        
        return {
            'total_files': total_files,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'storage_dir': str(user_dir)
        }

# Global PDF manager instance
pdf_manager = PDFManager()