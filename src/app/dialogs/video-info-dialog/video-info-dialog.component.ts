import { Component, OnInit, Inject } from '@angular/core';
import { filesize } from 'filesize';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { PostsService } from 'app/posts.services';
import { Category, DatabaseFile } from 'api-types';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-video-info-dialog',
  templateUrl: './video-info-dialog.component.html',
  styleUrls: ['./video-info-dialog.component.scss']
})
export class VideoInfoDialogComponent implements OnInit {
  file: DatabaseFile;
  new_file: DatabaseFile;
  filesize;
  window = window;
  upload_date: Date;
  category: Category;
  editing = false;
  initialized = false;
  retrieving_file = false;
  write_access = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public postsService: PostsService, private datePipe: DatePipe) { }

  ngOnInit(): void {
    this.filesize = filesize;
    if (this.data) {
      this.initializeFile(this.data.file);
    }
    this.postsService.reloadCategories();
    this.write_access = !this.file.user_uid || (this.file.user_uid && this.postsService.user?.uid === this.file.user_uid);
  }

  initializeFile(file: DatabaseFile): void {
    this.file = file;
    this.new_file = JSON.parse(JSON.stringify(file));

    // use UTC for the date picker. not the cleanest approach but it allows it to match the upload date
    this.upload_date = new Date(this.new_file.upload_date);
    this.upload_date.setMinutes( this.upload_date.getMinutes() + this.upload_date.getTimezoneOffset() );

    this.category = this.file.category ? this.file.category : {};

    // we need to align whether missing category is null or undefined. this line helps with that.
    if (!this.file.category) { this.new_file.category = null; this.file.category = null; }
    this.initialized = true;
  }

  saveChanges(): void {
    const change_obj = {};
    const keys = Object.keys(this.new_file);
    keys.forEach(key => {
      if (this.file[key] !== this.new_file[key]) change_obj[key] = this.new_file[key];
    });

    this.postsService.updateFile(this.file.uid, change_obj).subscribe(res => {
      this.getFile();
    });
  }

  getFile(): void {
    this.retrieving_file = true;
    this.postsService.getFile(this.file.uid).subscribe(res => {
      this.retrieving_file = false;
      this.file = res['file'];
      this.initializeFile(this.file);
    }, err => {
      this.retrieving_file = false;
      console.error(err);
    });
  }

  uploadDateChanged(event): void {
    this.new_file.upload_date = this.datePipe.transform(event.value, 'yyyy-MM-dd');
  }

  categoryChanged(event): void {
    const new_category = event.value;
    this.new_file.category = Object.keys(new_category).length ? {uid: new_category.uid, name: new_category.name} : null;
  }

  categoryComparisonFunction(option: Category, value: Category): boolean {
    // can't access properties of null/undefined values, prehandle these
    if (!option && !value) return true;
    else if (!option || !value) return false;

    return option.uid === value.uid;
  }

  metadataChanged(): boolean { 
    return JSON.stringify(this.file) !== JSON.stringify(this.new_file);
  }

  toggleFavorite(): void {
    this.file.favorite = !this.file.favorite;
    this.retrieving_file = true;
    this.postsService.updateFile(this.file.uid, {favorite: this.file.favorite}).subscribe(res => {
      this.getFile();
    });
  }

}
