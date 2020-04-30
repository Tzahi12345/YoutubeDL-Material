import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-set-default-admin-dialog',
  templateUrl: './set-default-admin-dialog.component.html',
  styleUrls: ['./set-default-admin-dialog.component.scss']
})
export class SetDefaultAdminDialogComponent implements OnInit {
  creating = false;
  input = '';
  constructor(private postsService: PostsService, public dialogRef: MatDialogRef<SetDefaultAdminDialogComponent>) { }

  ngOnInit(): void {
  }

  create() {
    this.creating = true;
    this.postsService.createAdminAccount(this.input).subscribe(res => {
      this.creating = false;
      if (res['success']) {
        this.dialogRef.close(true);
      } else {
        this.dialogRef.close(false);
      }
    }, err => {
      console.log(err);
      this.dialogRef.close(false);
    });
  }

}
