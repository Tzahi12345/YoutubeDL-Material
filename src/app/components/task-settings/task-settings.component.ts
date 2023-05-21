import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Task, TaskType } from 'api-types';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-task-settings',
  templateUrl: './task-settings.component.html',
  styleUrls: ['./task-settings.component.scss']
})
export class TaskSettingsComponent {
  task_key: TaskType;
  new_options = {};
  task: Task = null;

  constructor(private postsService: PostsService, @Inject(MAT_DIALOG_DATA) public data: {task: Task}) {
    this.task_key = this.data.task.key;
    this.task = this.data.task;
    if (!this.task.options) {
      this.task.options = {};
    }
  }

  ngOnInit(): void {
    this.getSettings();
  }

  getSettings(): void {
    this.postsService.getTask(this.task_key).subscribe(res => {
      this.task = res['task'];
      this.new_options = JSON.parse(JSON.stringify(this.task['options'])) || {};
    });
  }

  saveSettings(): void {
    this.postsService.updateTaskOptions(this.task_key, this.new_options).subscribe(() => {
      this.getSettings();
    }, () => {
      this.getSettings();
    });
  }

  optionsChanged(): boolean {
    return JSON.stringify(this.new_options) !== JSON.stringify(this.task.options);
  }
}
