import os
import unittest

class TestT24DestructiveScriptsQuarantined(unittest.TestCase):
    def test_destructive_scripts_are_quarantined(self):
        # The paths where the destructive scripts used to live
        forbidden_paths = [
            "scripts/run_drive_retro.py",
            "scripts/generate_empty_bookmarks.py",
            "scripts/cleanup_instagram_folders.py",
            "scripts/maintenance/cleanup_duplicates.py",
            "scripts/utils/execute_migration.py"
        ]
        
        for path in forbidden_paths:
            self.assertFalse(
                os.path.exists(path),
                f"Destructive script still exists in live path: {path}. It should be moved to _archive."
            )
            
        # Verify they are in the _archive folder
        expected_archived_paths = [
            "scripts/_archive/run_drive_retro.py",
            "scripts/_archive/generate_empty_bookmarks.py",
            "scripts/_archive/cleanup_instagram_folders.py",
            "scripts/_archive/cleanup_duplicates.py",
            "scripts/_archive/execute_migration.py"
        ]
        
        for path in expected_archived_paths:
            self.assertTrue(
                os.path.exists(path),
                f"Destructive script was not found in archive: {path}"
            )

if __name__ == '__main__':
    unittest.main()
