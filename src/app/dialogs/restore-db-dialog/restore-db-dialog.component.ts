import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-restore-db-dialog',
  templateUrl: './restore-db-dialog.component.html',
  styleUrls: ['./restore-db-dialog.component.scss']
})
export class RestoreDbDialogComponent implements OnInit {

  db_backups = [];
  selected_backup = null;
  restoring = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private dialogRef: MatDialogRef<RestoreDbDialogComponent>, private postsService: PostsService) {
    if (this.data?.db_backups) {
      this.db_backups = this.data.db_backups;
    }

    this.getDBBackups();
  }

  ngOnInit(): void {
  }

  getDBBackups(): void {
    this.postsService.getDBBackups().subscribe(res => {
      this.db_backups = res['db_backups'];
    });
  }

  restoreClicked(): void {
    this.restoring = true;
    if (this.selected_backup.length !== 1) return;
    this.postsService.restoreDBBackup(this.selected_backup[0]).subscribe(res => {
      this.restoring = false;
      if (res['success']) {
        this.postsService.openSnackBar('Database successfully restored!');
        this.dialogRef.close();
      } else {
        this.postsService.openSnackBar('Failed to restore database! See logs for more info.');
      }
    }, err => {
      this.restoring = false;
      this.postsService.openSnackBar('Failed to restore database! See browser console for more info.');
      console.error(err);
    });
  }

}
