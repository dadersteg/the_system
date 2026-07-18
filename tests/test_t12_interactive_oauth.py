import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# Add src and scripts to path if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scripts.utils.sync_tasks_combined import get_credentials

class TestT12InteractiveOAuth(unittest.TestCase):
    @patch('scripts.utils.sync_tasks_combined.InstalledAppFlow')
    @patch('scripts.utils.sync_tasks_combined.os.path.exists')
    def test_no_interactive_oauth_on_missing_token(self, mock_exists, mock_flow):
        # We want to simulate that token does NOT exist, but creds file DOES exist
        def side_effect(path):
            if 'token' in path:
                return False
            if 'creds' in path:
                return True
            return False
        
        mock_exists.side_effect = side_effect
        
        mock_flow_instance = MagicMock()
        mock_flow.from_client_secrets_file.return_value = mock_flow_instance
        
        # In the original code, this would call mock_flow_instance.run_local_server
        # We want to assert that it raises SystemExit instead of calling run_local_server
        with self.assertRaises(SystemExit) as cm:
            get_credentials("dummy_token.json", "dummy_creds.json", "Test Account")
        
        # Assert exit code is 1
        self.assertEqual(cm.exception.code, 1)
        
        # Ensure run_local_server was never called
        mock_flow_instance.run_local_server.assert_not_called()

if __name__ == '__main__':
    unittest.main()
