import sys
import os
import unittest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import lib.config
import lib.google_auth

class TestT29GoogleAuth(unittest.TestCase):
    def test_config_paths_relative(self):
        """Verify lib.config paths are correctly dynamically resolved relative to BASE_DIR."""
        self.assertTrue(os.path.isabs(lib.config.BASE_DIR))
        self.assertTrue(lib.config.BASE_DIR.endswith('the_system'))
        self.assertTrue('auth' in lib.config.AUTH_DIR)
        
    def test_google_auth_has_get_service(self):
        """Verify lib.google_auth exposes get_credentials or get_service."""
        self.assertTrue(hasattr(lib.google_auth, 'get_credentials'))

if __name__ == '__main__':
    unittest.main()
