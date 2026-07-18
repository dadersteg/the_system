import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Mock google modules before importing
sys.modules['google.auth.transport.requests'] = MagicMock()
sys.modules['google.oauth2.credentials'] = MagicMock()
sys.modules['googleapiclient.discovery'] = MagicMock()
sys.modules['google.auth'] = MagicMock()
sys.modules['google_auth_oauthlib'] = MagicMock()
sys.modules['google_auth_oauthlib.flow'] = MagicMock()

# Add parent dir to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts/utils')))

from sync_tasks_combined import fetch_tasks_from_service

class TestT11Pagination(unittest.TestCase):
    def test_fetch_tasks_pagination(self):
        service = MagicMock()
        
        tasklists_mock = MagicMock()
        tasklists_mock.execute.return_value = {
            'items': [{'id': 'list1', 'title': 'My List'}]
        }
        service.tasklists().list.return_value = tasklists_mock
        
        tasks_mock = MagicMock()
        def tasks_list_side_effect(**kwargs):
            req = MagicMock()
            if 'pageToken' not in kwargs or not kwargs['pageToken']:
                req.execute.return_value = {
                    'items': [{'id': f't{i}', 'title': f'Task {i}'} for i in range(100)],
                    'nextPageToken': 'token_for_page_2'
                }
            else:
                req.execute.return_value = {
                    'items': [{'id': f't{i}', 'title': f'Task {i}'} for i in range(100, 150)]
                }
            return req
            
        service.tasks().list.side_effect = tasks_list_side_effect
        
        all_tasks = fetch_tasks_from_service(service, "Test")
        
        self.assertIn('My List', all_tasks)
        self.assertEqual(len(all_tasks['My List']), 150, "Pagination failed: Did not retrieve all 150 tasks")

if __name__ == '__main__':
    unittest.main()
