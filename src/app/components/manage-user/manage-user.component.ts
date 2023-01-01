import { Component, OnInit, Inject } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { User } from 'api-types';

@Component({
  selector: 'app-manage-user',
  templateUrl: './manage-user.component.html',
  styleUrls: ['./manage-user.component.scss']
})
export class ManageUserComponent implements OnInit {

  user = null;
  newPasswordInput = '';
  available_permissions = null;
  permissions = null;

  permissionToLabel = {
    'filemanager': $localize`File manager`,
    'settings': $localize`Settings access`,
    'subscriptions': $localize`Subscriptions`,
    'sharing': $localize`Share files`,
    'advanced_download': $localize`Use advanced download mode`,
    'downloads_manager': $localize`Use downloads manager`,
    'tasks_manager': $localize`Use tasks manager`,
  }

  settingNewPassword = false;

  constructor(public postsService: PostsService, @Inject(MAT_DIALOG_DATA) public data: {user: User}) {
    if (this.data) {
      this.user = this.data.user;
      this.available_permissions = this.postsService.available_permissions;
      this.parsePermissions();
    }
  }

  ngOnInit(): void {
  }

  parsePermissions() {
    this.permissions = {};
    for (let i = 0; i < this.available_permissions.length; i++) {
      const permission = this.available_permissions[i];
      if (this.user.permission_overrides.includes(permission)) {
        if (this.user.permissions.includes(permission)) {
          this.permissions[permission] = 'yes';
        } else {
        this.permissions[permission] = 'no';
        }
      } else {
        this.permissions[permission] = 'default';
      }
    }
  }

  changeUserPermissions(change, permission) {
    this.postsService.setUserPermission(this.user.uid, permission, change.value).subscribe(() => {
      // console.log(res);
    });
  }

  setNewPassword() {
    this.settingNewPassword = true;
    this.postsService.changeUserPassword(this.user.uid, this.newPasswordInput).subscribe(() => {
      this.newPasswordInput = '';
      this.settingNewPassword = false;
    });
  }

}
