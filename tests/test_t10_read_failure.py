import unittest
from unittest.mock import patch, MagicMock

import sys
import os
from unittest.mock import MagicMock, patch

# Mock google libraries before importing the script
sys.modules['google'] = MagicMock()
sys.modules['google.oauth2'] = MagicMock()
sys.modules['google.oauth2.credentials'] = MagicMock()
sys.modules['googleapiclient'] = MagicMock()
sys.modules['googleapiclient.discovery'] = MagicMock()

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts/utils')))

from sheet_sync_and_maintenance import sync_and_maintain_account

class TestT10ReadFailure(unittest.TestCase):
    @patch('sheet_sync_and_maintenance.get_tasks_service')
    @patch('sheet_sync_and_maintenance.get_sheet_title_by_gid')
    def test_abort_on_read_failure(self, mock_get_sheet_title, mock_get_tasks):
        # Setup mocks
        mock_get_sheet_title.return_value = 'Completed Tasks Log'
        
        mock_sheets_service = MagicMock()
        mock_sheet_api = MagicMock()
        mock_sheets_service.spreadsheets.return_value = mock_sheet_api
        
        # Simulate a read failure when fetching existing logs
        mock_sheet_api.values().get().execute.side_effect = Exception("Transient Google API Error 500")
        
        # Execution
        # This should raise an exception or abort without calling clear() or update() or delete()
        mock_tasks_service = mock_get_tasks.return_value
        
        # Mock get_task_lists returning a dummy list
        mock_tasks_service.tasklists().list().execute.return_value = {
            'items': [{'id': 'list1', 'title': 'My Tasks'}]
        }
        
        # Mock an active task being returned
        mock_tasks_service.tasks().list().execute.return_value = {
            'items': [{'id': 'task1', 'title': 'Test task', 'status': 'needsAction', 'notes': ''}]
        }

        try:
            sync_and_maintain_account(
                mock_sheets_service, 
                'dummy_token_path', 
                'dummy_spreadsheet_id', 
                'Private'
            )
        except Exception as e:
            pass
            
        # Assertion
        # 1. It should NOT clear the sheet
        mock_sheet_api.values().clear.assert_not_called()
        # 2. It should NOT update the sheet
        mock_sheet_api.values().update.assert_not_called()
        
        # 3. It should NOT attempt to delete tasks
        mock_tasks_service = mock_get_tasks.return_value
        mock_tasks_service.new_batch_http_request.assert_not_called()

if __name__ == '__main__':
    unittest.main()
