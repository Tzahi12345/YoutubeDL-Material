import { Component, ElementRef, Input, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-twitch-chat',
  templateUrl: './twitch-chat.component.html',
  styleUrls: ['./twitch-chat.component.scss']
})
export class TwitchChatComponent implements OnInit, OnDestroy {

  full_chat = null;
  visible_chat = null;
  chat_response_received = false;
  downloading_chat = false;

  current_chat_index = null;

  CHAT_CHECK_INTERVAL_MS = 200;
  chat_check_interval_obj = null;

  scrollContainer = null;

  @Input() db_file = null;
  @Input() sub = null;
  @Input() current_timestamp = null;

  @ViewChild('scrollContainer') scrollRef: ElementRef;
  @ViewChildren('chat') chat: QueryList<any>;

  constructor(private postsService: PostsService) { }

  ngOnInit(): void {
    this.getFullChat();
  }

  ngOnDestroy(): void {
    if (this.chat_check_interval_obj) { clearInterval(this.chat_check_interval_obj); }
  }

  private isUserNearBottom(): boolean {
    const threshold = 150;
    const position = this.scrollContainer.scrollTop + this.scrollContainer.offsetHeight;
    const height = this.scrollContainer.scrollHeight;
    return position > height - threshold;
  }

  scrollToBottom = (force_scroll) => {
    if (force_scroll || this.isUserNearBottom()) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  addNewChatMessages() {
    const next_chat_index = this.getIndexOfNextChat();
    if (!this.scrollContainer) {
      this.scrollContainer = this.scrollRef.nativeElement;
    }
    if (this.current_chat_index === null) {
      this.current_chat_index = next_chat_index;
    }

    if (Math.abs(next_chat_index - this.current_chat_index) > 25) {
      this.visible_chat = [];
      this.current_chat_index = next_chat_index - 25;
      setTimeout(() => this.scrollToBottom(true), 100);
    }

    const latest_chat_timestamp = this.visible_chat.length ? this.visible_chat[this.visible_chat.length - 1]['timestamp'] : 0;

    for (let i = this.current_chat_index + 1; i < this.full_chat.length; i++) {
      if (this.full_chat[i]['timestamp'] >= latest_chat_timestamp && this.full_chat[i]['timestamp'] <= this.current_timestamp) {
        this.visible_chat.push(this.full_chat[i]);
        this.current_chat_index = i;
      } else if (this.full_chat[i]['timestamp'] > this.current_timestamp) {
        break;
      }
    }
  }

  getIndexOfNextChat() {
    const index = binarySearch(this.full_chat, 'timestamp', this.current_timestamp);
    return index;
  }

  getFullChat() {
    this.postsService.getFullTwitchChat(this.db_file.id, this.db_file.isAudio ? 'audio' : 'video', null, this.sub).subscribe(res => {
      this.chat_response_received = true;
      if (res['chat']) {
        this.initializeChatCheck(res['chat']);
      }
    });
  }

  downloadTwitchChat() {
    this.downloading_chat = true;
    let vodId = this.db_file.url.split('videos/').length > 1 && this.db_file.url.split('videos/')[1];
    vodId = vodId.split('?')[0];
    if (!vodId) {
      this.postsService.openSnackBar('VOD url for this video is not supported. VOD ID must be after "twitch.tv/videos/"');
    }
    this.postsService.downloadTwitchChat(this.db_file.id, this.db_file.isAudio ? 'audio' : 'video', vodId, null, this.sub).subscribe(res => {
      if (res['chat']) {
        this.initializeChatCheck(res['chat']);
      } else {
        this.downloading_chat = false;
        this.postsService.openSnackBar('Download failed.')
      }
    }, err => {
      this.downloading_chat = false;
      this.postsService.openSnackBar('Chat could not be downloaded.')
    });
  }

  initializeChatCheck(full_chat) {
    this.full_chat = full_chat;
    this.visible_chat = [];
    this.chat_check_interval_obj = setInterval(() => this.addNewChatMessages(), this.CHAT_CHECK_INTERVAL_MS);
  }

}

function binarySearch(arr, key, n) {
  let min = 0;
  let max = arr.length - 1;
  let mid;
  while (min <= max) {
    // tslint:disable-next-line: no-bitwise
    mid = (min + max) >>> 1;
    if (arr[mid][key] === n) {
      return mid;
    } else if (arr[mid][key] < n) {
      min = mid + 1;
    } else {
      max = mid - 1;
    }
  }

  return min;
}
