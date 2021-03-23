# Copyright 2017-2021 EPAM Systems, Inc. (https://www.epam.com/)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import os
import uuid

from fsbrowser.src.api.cloud_pipeline_api_provider import CloudPipelineApiProvider
from fsbrowser.src.git.git_client import GitClient
from fsbrowser.src.git.git_task import GitTask
from fsbrowser.src.model.versioned_storage import VersionedStorage

VERSION_STORAGE_IDENTIFIER = 'id'


class GitManager:

    def __init__(self, pool, tasks, logger, vs_working_directory):
        self.pool = pool
        self.tasks = tasks
        self.logger = logger
        self.root_folder = vs_working_directory
        self._create_dir_if_needed(self.root_folder)
        self.api_client = CloudPipelineApiProvider()
        git_credentials = self.api_client.get_git_credentials()
        self.git_client = GitClient(git_credentials.get('token'), git_credentials.get('userName'), logger)

    def clone(self, versioned_storage_id, revision=None):
        versioned_storage = self.api_client.get_pipeline(versioned_storage_id)
        folder_name = versioned_storage.get(VERSION_STORAGE_IDENTIFIER)
        full_repo_path = os.path.join(self.root_folder, str(folder_name))
        if self._is_latest_version(versioned_storage, revision):
            revision = None
        if self._is_dir_exists(full_repo_path):
            raise RuntimeError('Repository already exists!')
        git_url = versioned_storage.get('repository')
        task_id = str(uuid.uuid4().hex)
        task = GitTask(task_id, self.logger)
        self.tasks.update({task_id: task})
        self.pool.apply_async(task.clone, [self.git_client, full_repo_path, git_url, revision])
        return task_id

    def is_head_detached(self, versioned_storage_id):
        full_repo_path = self._build_path_to_repo(versioned_storage_id)
        return self.git_client.head(full_repo_path)

    def pull(self, versioned_storage_id):
        full_repo_path = self._build_path_to_repo(versioned_storage_id)
        task_id = str(uuid.uuid4().hex)
        task = GitTask(task_id, self.logger)
        self.tasks.update({task_id: task})
        self.pool.apply_async(task.pull, [self.git_client, full_repo_path])
        return task_id

    def list(self):
        items = []
        for item_name in os.listdir(self.root_folder):
            full_item_path = os.path.join(self.root_folder, item_name)
            if os.path.isfile(full_item_path):
                continue
            versioned_storage = self.api_client.get_pipeline(item_name)
            if not versioned_storage:
                self.logger.log("Versioned storage '%s' was not found" % item_name)
                continue
            versioned_storage_name = versioned_storage.get('name')
            items.append(VersionedStorage(item_name, versioned_storage_name, os.path.join(self.root_folder, item_name))
                         .to_json())
        return items

    def status(self, versioned_storage_id):
        full_repo_path = self._build_path_to_repo(versioned_storage_id)
        items = self.git_client.status(full_repo_path)
        return [item.to_json() for item in items]

    def diff(self, versioned_storage_id, file_path):
        full_repo_path = self._build_path_to_repo(versioned_storage_id)
        git_file_diff = self.git_client.diff(full_repo_path, file_path)
        if not git_file_diff:
            return None
        return git_file_diff.to_json()

    def push(self, versioned_storage_id, message, files_to_add=None):
        if self.is_head_detached(versioned_storage_id):
            raise RuntimeError('HEAD detached')
        if not message:
            raise RuntimeError('Message shall be specified')
        full_repo_path = self._build_path_to_repo(versioned_storage_id)
        task_id = str(uuid.uuid4().hex)
        task = GitTask(task_id, self.logger)
        self.tasks.update({task_id: task})
        self.pool.apply_async(task.push, [self.git_client, full_repo_path, message, files_to_add])
        return task_id

    def save_file(self, versioned_storage_id, path, content):
        if self.is_head_detached(versioned_storage_id):
            raise RuntimeError('HEAD detached')
        full_repo_path = self._build_path_to_repo(versioned_storage_id)
        task_id = str(uuid.uuid4().hex)
        task = GitTask(task_id, self.logger)
        self.tasks.update({task_id: task})
        self.pool.apply_async(task.save_file, [full_repo_path, path, content])
        return task_id

    def _build_path_to_repo(self, versioned_storage_id):
        versioned_storage = self.api_client.get_pipeline(versioned_storage_id)
        folder_name = versioned_storage.get(VERSION_STORAGE_IDENTIFIER)
        return os.path.join(self.root_folder, str(folder_name))

    @staticmethod
    def _create_dir_if_needed(dir_path):
        if not dir_path:
            raise RuntimeError("Working directory for versioned storages shall be specified")
        if GitManager._is_dir_exists(dir_path):
            return
        os.makedirs(dir_path)

    @staticmethod
    def _is_dir_exists(dir_path):
        return os.path.exists(dir_path) and os.path.isdir(dir_path)

    @staticmethod
    def _is_latest_version(pipeline, revision):
        current_version = pipeline.get('currentVersion')
        return revision and current_version and current_version.get('commitId') == revision
