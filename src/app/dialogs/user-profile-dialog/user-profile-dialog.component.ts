import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-user-profile-dialog',
  templateUrl: './user-profile-dialog.component.html',
  styleUrls: ['./user-profile-dialog.component.scss']
})
export class UserProfileDialogComponent implements OnInit {

  constructor(public postsService: PostsService, private router: Router, public dialogRef: MatDialogRef<UserProfileDialogComponent>) { }

  ngOnInit(): void {
  }

  loginClicked() {
    this.router.navigate(['/login']);
    this.dialogRef.close();
  }

  logoutClicked() {
    this.postsService.logout();
    this.dialogRef.close();
  }

}
