import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-unified-file-card',
  templateUrl: './unified-file-card.component.html',
  styleUrls: ['./unified-file-card.component.scss']
})
export class UnifiedFileCardComponent implements OnInit {

  // required info
  file_title = '';
  file_length = '';
  file_thumbnail = '';
  type = null;
  use_youtubedl_archive = false;

  isSubscriptionFile: boolean = null;

  @Input() file_obj = null;

  constructor() { }

  ngOnInit(): void {
    this.file_length = fancyTimeFormat(this.file_obj.duration);
  }

  deleteFile(blacklistMode = false) {

  }

  navigateToFile() {

  }

  openFileInfoDialog() {

  }
  
}

function fancyTimeFormat(time) {
  // Hours, minutes and seconds
  const hrs = ~~(time / 3600);
  const mins = ~~((time % 3600) / 60);
  const secs = ~~time % 60;

  // Output like "1:01" or "4:03:59" or "123:03:59"
  let ret = '';

  if (hrs > 0) {
      ret += '' + hrs + ':' + (mins < 10 ? '0' : '');
  }

  ret += '' + mins + ':' + (secs < 10 ? '0' : '');
  ret += '' + secs;
  return ret;
}
