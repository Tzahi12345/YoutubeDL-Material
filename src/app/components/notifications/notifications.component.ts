import { Component, ElementRef, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { PostsService } from 'app/posts.services';
import { Notification, NotificationType } from 'api-types';
import { NotificationAction } from 'api-types/models/NotificationAction';
import { MatChipListboxChange } from '@angular/material/chips';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {

  notifications: Notification[] = null;
  filtered_notifications: Notification[] = null;
  list_height = '65vh';

  @Output() notificationCount = new EventEmitter<number>();

  notificationFilters: { [key in NotificationType]: {key: string, label: string} } = {
    download_complete: {
      key: 'download_complete',
      label: $localize`Download completed`
    },
    download_error: {
      key: 'download_error',
      label: $localize`Download error`
    },
    task_finished: {
      key: 'task_finished',
      label: $localize`Task`
    },
  };

  selectedFilters = [];

  constructor(public postsService: PostsService, private router: Router, private elRef: ElementRef) { }

  ngOnInit(): void {
    // wait for init
    if (this.postsService.initialized) {
      this.getNotifications();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getNotifications();
        }
      });
    }
  }

  getNotifications(): void {
    this.postsService.getNotifications().subscribe(res => {
      this.notifications = res['notifications'];
      this.notifications.sort((a, b) => b.timestamp - a.timestamp);
      this.notificationCount.emit(this.notifications.filter(notification => !notification.read).length);

      this.filterNotifications();
    });
  }

  notificationAction(action_info: {notification: Notification, action: NotificationAction}): void {
    switch (action_info['action']) {
      case NotificationAction.PLAY:
        this.router.navigate(['player', {uid: action_info['notification']['data']['file_uid']}]);
        break;
      case NotificationAction.VIEW_DOWNLOAD_ERROR:
        this.router.navigate(['downloads']);
        break;
      case NotificationAction.RETRY_DOWNLOAD:
        this.postsService.restartDownload(action_info['notification']['data']['download_uid']).subscribe(res => {
          this.postsService.openSnackBar($localize`Download restarted!`);
          this.deleteNotification(action_info['notification']['uid']);
        });
        break;
      case NotificationAction.VIEW_TASKS:
        this.router.navigate(['tasks']);
        break;
      default:
        console.error(`Notification action ${action_info['action']} does not exist!`);
        break;
    }
  }

  deleteNotification(uid: string): void {
    this.postsService.deleteNotification(uid).subscribe(res => {
      this.notifications.filter(notification => notification['uid'] !== uid);
      this.filterNotifications();
      this.notificationCount.emit(this.notifications.length);
      this.getNotifications();
    });
  }

  deleteAllNotifications(): void {
    this.postsService.deleteAllNotifications().subscribe(res => {
      this.notifications = [];
      this.filtered_notifications = [];
      this.getNotifications();
    });
    this.notificationCount.emit(0);
  }

  setNotificationsToRead(): void {
    const uids = this.notifications.map(notification => notification.uid);
    this.postsService.setNotificationsToRead(uids).subscribe(res => {
      this.getNotifications();
    });
    this.notificationCount.emit(0);
  }

  filterNotifications(): void {
    this.filtered_notifications = this.notifications.filter(notification => this.selectedFilters.length === 0 || this.selectedFilters.includes(notification.type));
    // We need to do this to get the virtual scroll component to have an appropriate height
    this.calculateListHeight();
  }

  selectedFiltersChanged(event: MatChipListboxChange): void {
    this.selectedFilters = event.value;
    this.filterNotifications();
  }

  calculateListHeight() {
    const avgHeight = 166;
    const calcHeight = this.filtered_notifications.length * avgHeight;
    this.list_height = calcHeight > window.innerHeight*0.65 ? '65vh' : `${calcHeight}px`;
  }

  originalOrder = (): number => {
    return 0;
  }

}
