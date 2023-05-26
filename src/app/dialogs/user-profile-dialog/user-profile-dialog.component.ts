import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { isoLangs } from './locales_list';

@Component({
  selector: 'app-user-profile-dialog',
  templateUrl: './user-profile-dialog.component.html',
  styleUrls: ['./user-profile-dialog.component.scss']
})
export class UserProfileDialogComponent implements OnInit {

  all_locales = isoLangs;
  supported_locales = ['en', 'es', 'de', 'fr', 'nl', 'pt', 'it', 'ca', 'cs', 'nb', 'ru', 'zh', 'ko', 'id', 'en-GB'];
  initialLocale = localStorage.getItem('locale');
  sidepanel_mode = this.postsService.sidepanel_mode;
  card_size = this.postsService.card_size;

  constructor(public postsService: PostsService, private router: Router, public dialogRef: MatDialogRef<UserProfileDialogComponent>) { }

  ngOnInit(): void {
    this.postsService.getSupportedLocales().subscribe(res => {
      if (res && res['supported_locales']) {
        this.supported_locales = ['en', 'en-GB']; // required
        this.supported_locales = this.supported_locales.concat(res['supported_locales']);
      }
    }, err => {
      console.error(`Failed to retrieve list of supported languages! You may need to run: 'node src/postbuild.mjs'. Error below:`);
      console.error(err);
    });
  }

  loginClicked() {
    this.router.navigate(['/login']);
    this.dialogRef.close();
  }

  logoutClicked() {
    this.postsService.logout();
    this.dialogRef.close();
  }

  localeSelectChanged(new_val: string): void {
    localStorage.setItem('locale', new_val);
    this.postsService.openSnackBar($localize`Language successfully changed! Reload to update the page.`)
  }

  sidePanelModeChanged(new_mode) {
    localStorage.setItem('sidepanel_mode', new_mode);
    this.postsService.sidepanel_mode = new_mode;
  }

  cardSizeOptionChanged(new_size) {
    localStorage.setItem('card_size', new_size);
    this.postsService.card_size = new_size;
  }

}
