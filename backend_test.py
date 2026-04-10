#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class ToonweaverAPITester:
    def __init__(self, base_url: str = "https://animation-pipeline.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_token = None
        self.admin_user_id = None
        self.test_project_id = None
        self.test_shot_id = None
        self.test_user_id = None

    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = self.session.headers.copy()
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"Testing {name}...")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}", "PASS")
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}", "FAIL")
                if response.text:
                    self.log(f"Response: {response.text[:200]}", "ERROR")

            try:
                response_data = response.json() if response.text else {}
            except:
                response_data = {}

            return success, response_data

        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}", "ERROR")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        success, _ = self.run_test("Health Check", "GET", "health", 200)
        return success

    def test_admin_login(self):
        """Test admin login"""
        # First logout any existing session
        self.session.post(f"{self.base_url}/api/auth/logout")
        
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@toonweaver.com", "password": "Admin123!"}
        )
        
        if success and response.get('id'):
            self.admin_user_id = response['id']
            self.log(f"Admin logged in successfully. User ID: {self.admin_user_id}")
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.run_test("Get Current User", "GET", "auth/me", 200)
        if success:
            self.log(f"Current user: {response.get('name')} ({response.get('role')})")
        return success

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        success, response = self.run_test("Dashboard Stats", "GET", "stats/dashboard", 200)
        if success:
            self.log(f"Stats: {response.get('total_projects', 0)} projects, {response.get('total_shots', 0)} shots, {response.get('total_users', 0)} users")
        return success

    def test_create_project(self):
        """Test project creation"""
        project_data = {
            "name": f"Test Project {datetime.now().strftime('%H%M%S')}",
            "description": "Test project for API testing",
            "onedrive_link": "https://example.onedrive.com/test"
        }
        
        success, response = self.run_test(
            "Create Project",
            "POST",
            "projects",
            200,
            data=project_data
        )
        
        if success and response.get('id'):
            self.test_project_id = response['id']
            self.log(f"Project created with ID: {self.test_project_id}")
            return True
        return False

    def test_get_projects(self):
        """Test getting projects list"""
        success, response = self.run_test("Get Projects", "GET", "projects", 200)
        if success:
            self.log(f"Found {len(response)} projects")
        return success

    def test_get_project_details(self):
        """Test getting specific project details"""
        if not self.test_project_id:
            self.log("No test project ID available", "SKIP")
            return True
            
        success, response = self.run_test(
            "Get Project Details",
            "GET",
            f"projects/{self.test_project_id}",
            200
        )
        return success

    def test_create_shot(self):
        """Test shot creation"""
        if not self.test_project_id:
            self.log("No test project ID available", "SKIP")
            return True
            
        shot_data = {
            "shot_id": f"TEST_SH_{datetime.now().strftime('%H%M%S')}",
            "description": "Test shot for API testing",
            "frame_start": 1,
            "frame_end": 100,
            "deadline": (datetime.now() + timedelta(days=7)).isoformat()
        }
        
        success, response = self.run_test(
            "Create Shot",
            "POST",
            f"projects/{self.test_project_id}/shots",
            200,
            data=shot_data
        )
        
        if success and response.get('id'):
            self.test_shot_id = response['id']
            self.log(f"Shot created with ID: {self.test_shot_id}")
            return True
        return False

    def test_get_shots(self):
        """Test getting shots for a project"""
        if not self.test_project_id:
            self.log("No test project ID available", "SKIP")
            return True
            
        success, response = self.run_test(
            "Get Project Shots",
            "GET",
            f"projects/{self.test_project_id}/shots",
            200
        )
        if success:
            self.log(f"Found {len(response)} shots in project")
        return success

    def test_update_shot_status(self):
        """Test updating shot status"""
        if not self.test_project_id or not self.test_shot_id:
            self.log("No test project/shot ID available", "SKIP")
            return True
            
        success, _ = self.run_test(
            "Update Shot Status",
            "PUT",
            f"projects/{self.test_project_id}/shots/{self.test_shot_id}",
            200,
            data={"status": "in_progress"}
        )
        return success

    def test_get_users(self):
        """Test getting users list"""
        success, response = self.run_test("Get Users", "GET", "users", 200)
        if success:
            self.log(f"Found {len(response)} users")
        return success

    def test_create_user(self):
        """Test user registration"""
        user_data = {
            "email": f"test_{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "TestPass123!",
            "name": "Test User",
            "role": "animator"
        }
        
        success, response = self.run_test(
            "Create User",
            "POST",
            "auth/register",
            200,
            data=user_data
        )
        
        if success and response.get('id'):
            self.test_user_id = response['id']
            self.log(f"User created with ID: {self.test_user_id}")
            
            # Re-login as admin after user creation
            self.session.post(f"{self.base_url}/api/auth/logout")
            admin_login = self.run_test(
                "Re-login as Admin",
                "POST",
                "auth/login",
                200,
                data={"email": "admin@toonweaver.com", "password": "Admin123!"}
            )
            return True
        return False

    def test_get_notifications(self):
        """Test getting notifications"""
        success, response = self.run_test("Get Notifications", "GET", "notifications", 200)
        if success:
            self.log(f"Found {len(response)} notifications")
        return success

    def test_get_activity_log(self):
        """Test getting activity log"""
        if not self.test_project_id:
            self.log("No test project ID available", "SKIP")
            return True
            
        success, response = self.run_test(
            "Get Activity Log",
            "GET",
            f"projects/{self.test_project_id}/activity",
            200
        )
        if success:
            self.log(f"Found {len(response)} activity entries")
        return success

    def test_drive_mapper(self):
        """Test drive mapper file generation"""
        if not self.test_project_id:
            self.log("No test project ID available", "SKIP")
            return True
            
        success, _ = self.run_test(
            "Generate Drive Mapper",
            "GET",
            f"projects/{self.test_project_id}/drive-mapper",
            200
        )
        return success

    def test_logout(self):
        """Test logout"""
        success, _ = self.run_test("Logout", "POST", "auth/logout", 200)
        return success

    def cleanup(self):
        """Clean up test data"""
        if self.test_shot_id and self.test_project_id:
            self.run_test(
                "Cleanup Shot",
                "DELETE",
                f"projects/{self.test_project_id}/shots/{self.test_shot_id}",
                200
            )
        
        if self.test_project_id:
            self.run_test(
                "Cleanup Project",
                "DELETE",
                f"projects/{self.test_project_id}",
                200
            )

    def run_all_tests(self):
        """Run all API tests"""
        self.log("Starting Toonweaver API Tests")
        self.log(f"Testing against: {self.base_url}")
        
        # Test sequence
        tests = [
            self.test_health_check,
            self.test_admin_login,
            self.test_get_current_user,
            self.test_dashboard_stats,
            self.test_get_users,
            self.test_create_user,
            self.test_create_project,
            self.test_get_projects,
            self.test_get_project_details,
            self.test_create_shot,
            self.test_get_shots,
            self.test_update_shot_status,
            self.test_get_notifications,
            self.test_get_activity_log,
            self.test_drive_mapper,
            self.test_logout,
        ]
        
        failed_tests = []
        
        for test in tests:
            try:
                if not test():
                    failed_tests.append(test.__name__)
            except Exception as e:
                self.log(f"Test {test.__name__} failed with exception: {e}", "ERROR")
                failed_tests.append(test.__name__)
        
        # Cleanup
        self.cleanup()
        
        # Results
        self.log("\n" + "="*50)
        self.log("TEST RESULTS")
        self.log("="*50)
        self.log(f"Tests Run: {self.tests_run}")
        self.log(f"Tests Passed: {self.tests_passed}")
        self.log(f"Tests Failed: {self.tests_run - self.tests_passed}")
        self.log(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if failed_tests:
            self.log(f"Failed Tests: {', '.join(failed_tests)}", "ERROR")
            return False
        else:
            self.log("All tests passed! ✅", "PASS")
            return True

def main():
    tester = ToonweaverAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())