import { Component, OnInit, Inject } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

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
    'filemanager': 'File manager',
    'settings': 'Settings access',
    'subscriptions': 'Subscriptions',
    'sharing': 'Share files',
    'advanced_download': 'Use advanced download mode',
    'downloads_manager': 'Use downloads manager'
  }

  settingNewPassword = false;

  constructor(public postsService: PostsService, @Inject(MAT_DIALOG_DATA) public data: any) {
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
    this.postsService.setUserPermission(this.user.uid, permission, change.value).subscribe(res => {
      // console.log(res);
    });
  }

  setNewPassword() {
    this.settingNewPassword = true;
    this.postsService.changeUserPassword(this.user.uid, this.newPasswordInput).subscribe(res => {
      this.newPasswordInput = '';
      this.settingNewPassword = false;
    });
  }

}
