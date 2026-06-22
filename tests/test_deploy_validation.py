#!/usr/bin/env python3
"""
test_deploy_validation.py
Verifies that deploy.sh behaves correctly under various input scenarios.
"""
import os
import shutil
import subprocess
import tempfile
import unittest

class TestDeployValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # We need to run from the repository root directory
        # (the directory containing deploy.sh)
        cls.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Back up existing .clasp.json
        cls.clasp_json_path = os.path.join(cls.repo_root, ".clasp.json")
        cls.clasp_backup_path = os.path.join(cls.repo_root, ".clasp.json.bak")
        cls.has_backup = False
        if os.path.exists(cls.clasp_json_path):
            shutil.copy2(cls.clasp_json_path, cls.clasp_backup_path)
            cls.has_backup = True

        # Set up mock clasp executable to prevent real clasp pushes during tests
        cls.temp_dir = tempfile.mkdtemp()
        mock_clasp_file = os.path.join(cls.temp_dir, "clasp")
        with open(mock_clasp_file, "w") as f:
            f.write("#!/bin/sh\n")
            f.write('echo "Mock clasp executed with args: $*"\n')
            f.write("exit 0\n")
        os.chmod(mock_clasp_file, 0o755)

        # Build custom environment
        cls.env = os.environ.copy()
        cls.env["PATH"] = cls.temp_dir + os.path.pathsep + cls.env.get("PATH", "")

    @classmethod
    def tearDownClass(cls):
        # Clean up mock clasp temp dir
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

        # Restore original .clasp.json
        if cls.has_backup:
            if os.path.exists(cls.clasp_backup_path):
                shutil.move(cls.clasp_backup_path, cls.clasp_json_path)
        else:
            if os.path.exists(cls.clasp_json_path):
                os.remove(cls.clasp_json_path)

    def run_deploy(self, args):
        script_path = os.path.join(self.repo_root, "deploy.sh")
        result = subprocess.run(
            [script_path] + args,
            capture_output=True,
            text=True,
            env=self.env,
            cwd=self.repo_root
        )
        return result.returncode, result.stdout, result.stderr

    def test_zero_arguments(self):
        # Zero arguments: ./deploy.sh -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy([])
        self.assertEqual(code, 1)
        self.assertIn("Error: Exactly one argument is required.", stdout)

    def test_empty_argument(self):
        # Empty argument: ./deploy.sh "" -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy([""])
        self.assertEqual(code, 1)
        self.assertIn("Error: Invalid environment", stdout)
        self.assertIn("Must be 'private' or 'work'", stdout)

    def test_whitespace_argument(self):
        # Whitespace argument: ./deploy.sh " " -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy([" "])
        self.assertEqual(code, 1)
        self.assertIn("Error: Invalid environment", stdout)

    def test_multiple_valid_arguments(self):
        # Multiple valid arguments: ./deploy.sh private work -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy(["private", "work"])
        self.assertEqual(code, 1)
        self.assertIn("Error: Exactly one argument is required.", stdout)

    def test_invalid_argument(self):
        # Invalid argument: ./deploy.sh both -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy(["both"])
        self.assertEqual(code, 1)
        self.assertIn("Error: Invalid environment 'both'. Must be 'private' or 'work'.", stdout)

    def test_attempted_command_injection(self):
        # Attempted command injection: ./deploy.sh "private; echo hacked" -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy(["private; echo hacked"])
        self.assertEqual(code, 1)
        self.assertIn("Error: Invalid environment 'private; echo hacked'. Must be 'private' or 'work'.", stdout)
        # Ensure 'hacked' was not executed (we check that the word 'hacked' is not printed on its own line)
        lines = [line.strip() for line in stdout.splitlines()]
        self.assertNotIn("hacked", lines)
        self.assertNotIn("hacked", stderr)

    def test_trailing_leading_whitespace(self):
        # Trailing/leading whitespace: ./deploy.sh " private " -> must abort (exit 1).
        code, stdout, stderr = self.run_deploy([" private "])
        self.assertEqual(code, 1)
        self.assertIn("Error: Invalid environment ' private '. Must be 'private' or 'work'.", stdout)

    def test_newline_injection(self):
        # Newline injection: ./deploy.sh "work\n" -> must abort (exit 1).
        for val in ["work\n", "work\\n"]:
            code, stdout, stderr = self.run_deploy([val])
            self.assertEqual(code, 1)
            self.assertIn("Error: Invalid environment", stdout)

    def test_valid_arguments(self):
        # Verify that valid arguments (like private, work, PrIvAtE, WoRk) are parsed correctly
        # and proceed beyond validation checks (reaching the configuration copying step).
        valid_envs = ["private", "work", "PrIvAtE", "WoRk"]
        for env in valid_envs:
            # We want to check that it copies config file successfully
            code, stdout, stderr = self.run_deploy([env])
            self.assertEqual(code, 0, f"Expected success for env: {env}, got exit code {code}")
            
            # Check config copying message
            expected_env_lower = env.lower()
            self.assertIn(f"Active clasp configuration set to: .clasp-{expected_env_lower}.json", stdout)
            self.assertIn("Mock clasp executed with args: push", stdout)
            
            # Check that config file was actually copied
            config_source_path = os.path.join(self.repo_root, f".clasp-{expected_env_lower}.json")
            with open(config_source_path, "r") as src_f:
                src_content = src_f.read()
            with open(self.clasp_json_path, "r") as dest_f:
                dest_content = dest_f.read()
            self.assertEqual(src_content, dest_content)

if __name__ == '__main__':
    unittest.main()
