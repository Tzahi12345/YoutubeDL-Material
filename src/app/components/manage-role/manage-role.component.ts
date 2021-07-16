import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-manage-role',
  templateUrl: './manage-role.component.html',
  styleUrls: ['./manage-role.component.scss']
})
export class ManageRoleComponent implements OnInit {

  role = null;
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

  constructor(public postsService: PostsService, private dialogRef: MatDialogRef<ManageRoleComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any) {
    if (this.data) {
      this.role = this.data.role;
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
      if (this.role.permissions.includes(permission)) {
        this.permissions[permission] = 'yes';
      } else {
      this.permissions[permission] = 'no';
      }
    }
  }

  changeRolePermissions(change, permission) {
    this.postsService.setRolePermission(this.role.key, permission, change.value).subscribe(res => {
      if (res['success']) {

      } else {
        this.permissions[permission] = this.permissions[permission] === 'yes' ? 'no' : 'yes';
      }
    }, err => {
      this.permissions[permission] = this.permissions[permission] === 'yes' ? 'no' : 'yes';
    });
  }

}
