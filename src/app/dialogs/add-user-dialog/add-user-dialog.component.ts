import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-add-user-dialog',
  templateUrl: './add-user-dialog.component.html',
  styleUrls: ['./add-user-dialog.component.scss']
})
export class AddUserDialogComponent implements OnInit {

  usernameInput = '';
  passwordInput = '';

  constructor(private postsService: PostsService, public dialogRef: MatDialogRef<AddUserDialogComponent>) { }

  ngOnInit(): void {
  }

  createUser() {
    this.postsService.register(this.usernameInput, this.passwordInput).subscribe(res => {
      if (res['user']) {
        this.dialogRef.close(res['user']);
      } else {
        this.dialogRef.close({error: 'Unknown error'});
      }
    }, err => {
      this.dialogRef.close({error: err});
    });
  }

}
