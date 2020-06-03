import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { Download } from 'app/main/main.component';


@Component({
  selector: 'app-download-item',
  templateUrl: './download-item.component.html',
  styleUrls: ['./download-item.component.scss']
})
export class DownloadItemComponent implements OnInit {

  @Input() download: Download = {
    uid: null,
    type: 'audio',
    percent_complete: 0,
    complete: false,
    url: 'http://youtube.com/watch?v=17848rufj',
    downloading: true,
    timestamp_start: null,
    timestamp_end: null,
    is_playlist: false,
    error: false
  };
  @Output() cancelDownload = new EventEmitter<Download>();

  @Input() queueNumber = null;

  url_id = null;

  constructor() { }

  ngOnInit() {
    if (this.download && this.download.url && this.download.url.includes('youtu')) {
      const string_id = (this.download.is_playlist ? '?list=' : '?v=')
      const index_offset = (this.download.is_playlist ? 6 : 3);
      const end_index = this.download.url.indexOf(string_id) + index_offset;
      this.url_id = this.download.url.substring(end_index, this.download.url.length);
    }
  }

  cancelTheDownload() {
    this.cancelDownload.emit(this.download);
  }

}
