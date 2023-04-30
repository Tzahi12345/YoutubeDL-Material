import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Notification } from 'api-types';
import { NotificationAction } from 'api-types/models/NotificationAction';
import { NotificationType } from 'api-types/models/NotificationType';

@Component({
  selector: 'app-notifications-list',
  templateUrl: './notifications-list.component.html',
  styleUrls: ['./notifications-list.component.scss']
})
export class NotificationsListComponent {
  @Input() notifications = null;
  @Output() deleteNotification = new EventEmitter<string>();
  @Output() notificationAction = new EventEmitter<{notification: Notification, action: NotificationAction}>();

  NOTIFICATION_PREFIX: { [key in NotificationType]: string } = {
    download_complete: $localize`Finished downloading`,
    download_error: $localize`Download failed`,
    task_finished: $localize`Task finished`
  }

  // Attaches string to the end of the notification text
  NOTIFICATION_SUFFIX_KEY: { [key in NotificationType]: string } = {
    download_complete: 'file_title',
    download_error: 'download_url',
    task_finished: 'task_title'
  }

  NOTIFICATION_ACTION_TO_STRING: { [key in NotificationAction]: string } = {
    play: $localize`Play`,
    retry_download: $localize`Retry download`,
    view_download_error: $localize`View error`,
    view_tasks: $localize`View task`
  }

  NOTIFICATION_COLOR: { [key in NotificationAction]: string } = {
    play: 'primary',
    retry_download: 'primary',
    view_download_error: 'warn',
    view_tasks: 'primary'
  }

  NOTIFICATION_ICON: { [key in NotificationAction]: string } = {
    play: 'smart_display',
    retry_download: 'restart_alt',
    view_download_error: 'warning',
    view_tasks: 'task'
  }

  emitNotificationAction(notification: Notification, action: NotificationAction): void {
    this.notificationAction.emit({notification: notification, action: action});
  }

  emitDeleteNotification(uid: string): void {
    this.deleteNotification.emit(uid);
  }
}
