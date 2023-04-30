import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PostsService } from 'app/posts.services';
import CryptoJS from 'crypto-js';

@Component({
  selector: 'app-skip-ad-button',
  templateUrl: './skip-ad-button.component.html',
  styleUrls: ['./skip-ad-button.component.scss']
})
export class SkipAdButtonComponent implements OnInit {

  @Input() current_video = null;
  @Input() playback_timestamp = null;
  
  @Output() setPlaybackTimestamp = new EventEmitter<any>();

  sponsor_block_cache = {};
  show_skip_ad_button = false;

  skip_ad_button_check_interval = null;

  constructor(private postsService: PostsService) { }

  ngOnInit(): void {
    this.skip_ad_button_check_interval = setInterval(() => this.skipAdButtonCheck(), 500);
  }

  ngOnDestroy(): void {
    clearInterval(this.skip_ad_button_check_interval);
  }

  checkSponsorBlock(video_to_check) {
    if (!video_to_check) return;

    // check cache, null means it has been checked and confirmed not to exist (limits API calls)
    if (this.sponsor_block_cache[video_to_check.url] || this.sponsor_block_cache[video_to_check.url] === null) return;

    // sponsor block needs first 4 chars from video ID hash
    const video_id = this.getVideoIDFromURL(video_to_check.url);
    const id_hash = this.getVideoIDHashFromURL(video_id);
    if (!id_hash || id_hash.length < 4) return;
    const truncated_id_hash = id_hash.substring(0, 4);

    // we couldn't get the data from the cache, let's get it from sponsor block directly

    this.postsService.getSponsorBlockDataForVideo(truncated_id_hash).subscribe(res => {
      if (res && res['length'] && res['length'] === 0) {
        return;
      }

      const found_data = res['find'](data => data['videoID'] === video_id);
      if (found_data) {
        this.sponsor_block_cache[video_to_check.url] = found_data;
      } else {
        this.sponsor_block_cache[video_to_check.url] = null;
      }
    }, err => {
      // likely doesn't exist
      this.sponsor_block_cache[video_to_check.url] = null;
    });
  }

  getVideoIDHashFromURL(video_id) {
    if (!video_id) return null;
    return CryptoJS.SHA256(video_id).toString(CryptoJS.enc.Hex);
  }

  getVideoIDFromURL(url) {
    const regex_exp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regex_exp);
    return (match && match[7].length==11) ? match[7] : null;
  }

  skipAdButtonCheck() {
    const sponsor_block_data = this.sponsor_block_cache[this.current_video.url];
    if (!sponsor_block_data && sponsor_block_data !== null) {
      // we haven't yet tried to get the sponsor block data for the video
      this.checkSponsorBlock(this.current_video);
    } else if (!sponsor_block_data) {
      this.show_skip_ad_button = false;
      return;
    }

    if (this.getTimeToSkipTo()) {
      this.show_skip_ad_button = true;
    } else {
      this.show_skip_ad_button = false;
    }
  }

  getTimeToSkipTo() {
    const sponsor_block_data = this.sponsor_block_cache[this.current_video.url];

    if (!sponsor_block_data) return;

    // check if we're in between an ad segment
    const found_segment = sponsor_block_data['segments'].find(segment_data => this.playback_timestamp > segment_data.segment[0] && this.playback_timestamp < segment_data.segment[1] - 0.5);

    if (found_segment) {
      return found_segment['segment'][1];
    }

    return null;
  }

  skipAdButtonClicked() {
    const time_to_skip_to = this.getTimeToSkipTo();
    if (!time_to_skip_to) return;

    this.setPlaybackTimestamp.emit(time_to_skip_to);

    this.show_skip_ad_button = false;
  }

}
