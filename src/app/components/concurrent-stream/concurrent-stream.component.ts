import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-concurrent-stream',
  templateUrl: './concurrent-stream.component.html',
  styleUrls: ['./concurrent-stream.component.scss']
})
export class ConcurrentStreamComponent implements OnInit {

  @Input() server_mode = false;
  @Input() playback_timestamp;
  @Input() playing;
  @Input() uid;

  @Output() setPlaybackTimestamp = new EventEmitter<any>();
  @Output() togglePlayback = new EventEmitter<boolean>();
  @Output() setPlaybackRate = new EventEmitter<number>();

  started = false;
  server_started = false;
  watch_together_clicked = false;

  server_already_exists = null;

  check_timeout: any;
  update_timeout: any;

  PLAYBACK_TIMESTAMP_DIFFERENCE_THRESHOLD_PLAYBACK_MODIFICATION = 0.5;
  PLAYBACK_TIMESTAMP_DIFFERENCE_THRESHOLD_SKIP = 2;

  PLAYBACK_MODIFIER = 0.1;

  playback_rate_modified = false;

  constructor(private postsService: PostsService) { }

  // flow: click start watching -> check for available stream to enable join button and if user, display "start stream"
  // users who join a stream will send continuous requests for info on playback

  ngOnInit(): void {

  }

  ngOnDestroy(): void {
    if (this.check_timeout) { clearInterval(this.check_timeout); }
    if (this.update_timeout) { clearInterval(this.update_timeout); }
  }

  startServer() {
    this.started = true;
    this.server_started = true;
    this.update_timeout = setInterval(() => {
      this.updateStream();
    }, 1000);
  }

  updateStream() {
    this.postsService.updateConcurrentStream(this.uid, this.playback_timestamp, Date.now()/1000, this.playing).subscribe(res => {
    });
  }

  startClient() {
    this.started = true;
  }

  checkStream() {
    if (this.server_started) { return; }
    const current_playback_timestamp = this.playback_timestamp;
    const current_unix_timestamp = Date.now()/1000;
    this.postsService.checkConcurrentStream(this.uid).subscribe(res => {
      const stream = res['stream'];

      if (!stream) {
        this.server_already_exists = false;
        return;
      }

      this.server_already_exists = true;

      // check whether client has joined the stream
      if (!this.started) { return; }

      if (!stream['playing'] && this.playing) {
        // tell client to pause and set the timestamp to sync
        this.togglePlayback.emit(false);
        this.setPlaybackTimestamp.emit(stream['playback_timestamp']);
      } else if (stream['playing']) {
        // sync unpause state
        if (!this.playing) { this.togglePlayback.emit(true); }

        // sync time
        const zeroed_local_unix_timestamp = current_unix_timestamp - current_playback_timestamp;
        const zeroed_server_unix_timestamp = stream['unix_timestamp'] - stream['playback_timestamp'];

        const seconds_behind_locally = zeroed_local_unix_timestamp - zeroed_server_unix_timestamp;

        if (Math.abs(seconds_behind_locally) > this.PLAYBACK_TIMESTAMP_DIFFERENCE_THRESHOLD_SKIP) {
          // skip to playback timestamp because the difference is too high
          this.setPlaybackTimestamp.emit(this.playback_timestamp + seconds_behind_locally + 0.3);
          this.playback_rate_modified = false;
        } else if (!this.playback_rate_modified && Math.abs(seconds_behind_locally) > this.PLAYBACK_TIMESTAMP_DIFFERENCE_THRESHOLD_PLAYBACK_MODIFICATION) {
          // increase playback speed to avoid skipping
          let seconds_to_wait = (Math.abs(seconds_behind_locally)/this.PLAYBACK_MODIFIER);
          seconds_to_wait += 0.3/this.PLAYBACK_MODIFIER;

          this.playback_rate_modified = true;

          if (seconds_behind_locally > 0) {
            // increase speed
            this.setPlaybackRate.emit(1 + this.PLAYBACK_MODIFIER);
            setTimeout(() => {
              this.setPlaybackRate.emit(1);
              this.playback_rate_modified = false;
            }, seconds_to_wait * 1000);
          } else {
            // decrease speed
            this.setPlaybackRate.emit(1 - this.PLAYBACK_MODIFIER);
            setTimeout(() => {
              this.setPlaybackRate.emit(1);
              this.playback_rate_modified = false;
            }, seconds_to_wait * 1000);
          }
        }
      }
    });
  }

  startWatching() {
    this.watch_together_clicked = true;
    this.check_timeout = setInterval(() => {
      this.checkStream();
    }, 1000);
  }

  stop() {
    if (this.check_timeout) { clearInterval(this.check_timeout); }
    if (this.update_timeout) { clearInterval(this.update_timeout); }
    this.started = false;
    this.server_started = false;
    this.watch_together_clicked = false;
  }


}
