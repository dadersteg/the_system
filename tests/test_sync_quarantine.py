import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Mock google libraries before importing the script
sys.modules['google'] = MagicMock()
sys.modules['google.auth'] = MagicMock()
sys.modules['google.auth.transport'] = MagicMock()
sys.modules['google.auth.transport.requests'] = MagicMock()
sys.modules['google.oauth2'] = MagicMock()
sys.modules['google.oauth2.credentials'] = MagicMock()
sys.modules['google_auth_oauthlib'] = MagicMock()
sys.modules['google_auth_oauthlib.flow'] = MagicMock()
sys.modules['googleapiclient'] = MagicMock()
sys.modules['googleapiclient.discovery'] = MagicMock()

# Adjust path to import scripts.utils.sync_tasks_combined
sys.path.append(os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.utils.sync_tasks_combined import (
    check_and_route_tasks,
    get_or_create_quarantine_list
)

class MockGoogleTasksService:
    def __init__(self, tasklists_data, tasks_data):
        self._tasklists_data = tasklists_data
        self._tasks_data = tasks_data
        self.calls = []

    def tasklists(self):
        class TasklistsResource:
            def __init__(self, service):
                self.service = service
            def list(self, maxResults=20, pageToken=None):
                self.service.calls.append(('tasklists.list', {'maxResults': maxResults, 'pageToken': pageToken}))
                class Request:
                    def execute(inner_self):
                        return {'items': self.service._tasklists_data}
                return Request()
            def insert(self, body):
                self.service.calls.append(('tasklists.insert', {'body': body}))
                class Request:
                    def execute(inner_self):
                        new_list = {'id': 'quarantine-list-id', 'title': body['title']}
                        self.service._tasklists_data.append(new_list)
                        return new_list
                return Request()
        return TasklistsResource(self)

    def tasks(self):
        class TasksResource:
            def __init__(self, service):
                self.service = service
            def list(self, tasklist, showCompleted=False):
                self.service.calls.append(('tasks.list', {'tasklist': tasklist, 'showCompleted': showCompleted}))
                class Request:
                    def execute(inner_self):
                        return {'items': self.service._tasks_data.get(tasklist, [])}
                return Request()
            def insert(self, tasklist, body):
                self.service.calls.append(('tasks.insert', {'tasklist': tasklist, 'body': body}))
                class Request:
                    def execute(inner_self):
                        new_task = dict(body)
                        new_task['id'] = f"new-task-{len(self.service._tasks_data.get(tasklist, []))}"
                        if tasklist not in self.service._tasks_data:
                            self.service._tasks_data[tasklist] = []
                        self.service._tasks_data[tasklist].append(new_task)
                        return new_task
                return Request()
            def patch(self, tasklist, task, body):
                self.service.calls.append(('tasks.patch', {'tasklist': tasklist, 'task': task, 'body': body}))
                class Request:
                    def execute(inner_self):
                        for t in self.service._tasks_data.get(tasklist, []):
                            if t.get('id') == task:
                                t.update(body)
                                return t
                        return None
                return Request()
            def delete(self, tasklist, task):
                self.service.calls.append(('tasks.delete', {'tasklist': tasklist, 'task': task}))
                class Request:
                    def execute(inner_self):
                        self.service._tasks_data[tasklist] = [
                            t for t in self.service._tasks_data.get(tasklist, [])
                            if t.get('id') != task
                        ]
                        return {}
                return Request()
        return TasksResource(self)

class TestSyncQuarantine(unittest.TestCase):
    def test_quarantine_routing(self):
        # 1. Setup mock private and work service data
        private_tasklists = [{'id': 'private-default', 'title': 'My Tasks'}]
        private_tasks = {
            'private-default': [
                {
                    'id': 'task-to-route-work',
                    'title': 'Playmetech: Fix bug #123',
                    'notes': '---SYSTEM_METADATA---\n{"category_path": "02 Work/02 01 00 Playmetech"}',
                    'status': 'needsAction'
                }
            ]
        }
        private_service = MockGoogleTasksService(private_tasklists, private_tasks)

        work_tasklists = [{'id': 'work-default', 'title': 'Work Tasks'}]
        work_tasks = {
            'work-default': [
                {
                    'id': 'task-to-route-private',
                    'title': 'Personal: Buy groceries',
                    'notes': '---SYSTEM_METADATA---\n{"category_path": "01 Private"}',
                    'status': 'needsAction'
                }
            ]
        }
        work_service = MockGoogleTasksService(work_tasklists, work_tasks)

        # 2. Patch the targets to redirect destination to work-default/private-default
        with patch('scripts.utils.sync_tasks_combined.WORK_TASKS_DEST', 'work-default'), \
             patch('scripts.utils.sync_tasks_combined.PRIVATE_TASKS_DEST', 'private-default'):
            check_and_route_tasks(private_service, work_service)

        # 3. Assertions
        # Check that Private to Work routed correctly:
        # - The work task is in Work account's default list
        # - The original work task is NOT in Private account's 'My Tasks' list
        # - The original work task IS in Private account's 'Triage Quarantine' list
        self.assertTrue(any('Playmetech: Fix bug #123' in t['title'] for t in work_tasks['work-default']))
        self.assertFalse(any(t['id'] == 'task-to-route-work' for t in private_tasks['private-default']))
        self.assertTrue(any('Playmetech: Fix bug #123' in t['title'] for t in private_tasks.get('quarantine-list-id', [])))

        # Check that Work to Private routed correctly:
        # - The personal task is in Private account's default list
        # - The original personal task is NOT in Work account's 'Work Tasks' list
        # - The original personal task IS in Work account's 'Triage Quarantine' list
        self.assertTrue(any('Personal: Buy groceries' in t['title'] for t in private_tasks['private-default']))
        self.assertFalse(any(t['id'] == 'task-to-route-private' for t in work_tasks['work-default']))
        self.assertTrue(any('Personal: Buy groceries' in t['title'] for t in work_tasks.get('quarantine-list-id', [])))

if __name__ == '__main__':
    unittest.main()
