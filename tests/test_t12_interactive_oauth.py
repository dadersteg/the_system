import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# Add src and scripts to path if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from lib.google_auth import get_credentials

class TestT12InteractiveOAuth(unittest.TestCase):
    @patch('lib.google_auth.os.path.exists')
    def test_no_interactive_oauth_on_missing_token(self, mock_exists):
        # We want to simulate that token does NOT exist, but creds file DOES exist
        def side_effect(path):
            if path and 'token' in path:
                return False
            if path and 'creds' in path:
                return True
            return False
        
        mock_exists.side_effect = side_effect
        
        # We want to assert that it raises SystemExit
        with self.assertRaises(SystemExit) as cm:
            get_credentials("dummy_token.json", "dummy_creds.json", "Test Account")
        
        # Assert exit code is 1
        self.assertEqual(cm.exception.code, 1)

if __name__ == '__main__':
    unittest.main()
