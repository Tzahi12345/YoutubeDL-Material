import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ConfirmDialogComponent } from 'app/dialogs/confirm-dialog/confirm-dialog.component';
import { RestoreDbDialogComponent } from 'app/dialogs/restore-db-dialog/restore-db-dialog.component';
import { UpdateTaskScheduleDialogComponent } from 'app/dialogs/update-task-schedule-dialog/update-task-schedule-dialog.component';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss']
})
export class TasksComponent implements OnInit {

  interval_id = null;
  tasks_check_interval = 1500;
  tasks = null;
  tasks_retrieved = false;

  displayedColumns: string[] = ['title', 'last_ran', 'last_confirmed', 'status', 'actions'];
  dataSource = null;

  db_backups = [];

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  constructor(private postsService: PostsService, private dialog: MatDialog) { }

  ngOnInit(): void {
    if (this.postsService.initialized) {
      this.getTasksRecurring();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getTasksRecurring();
        }
      });
    }
  }

  ngOnDestroy(): void {
    if (this.interval_id) { clearInterval(this.interval_id) }
  }

  getTasksRecurring(): void {
    this.getTasks();
    this.interval_id = setInterval(() => {
      this.getTasks();
    }, this.tasks_check_interval);
  }

  getTasks(): void {
    this.postsService.getTasks().subscribe(res => {
      if (this.tasks) {
        if (JSON.stringify(this.tasks) === JSON.stringify(res['tasks'])) return;
        for (const task of res['tasks']) {
          const task_index = this.tasks.map(t => t.key).indexOf(task['key']);
          this.tasks[task_index] = task;
        }
        this.dataSource = new MatTableDataSource<Task>(this.tasks);
      } else {
        this.tasks = res['tasks'];
        this.dataSource = new MatTableDataSource<Task>(this.tasks);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      }
    });
  }

  runTask(task_key: string): void {
    this.postsService.runTask(task_key).subscribe(res => {
      this.getTasks();
      this.getDBBackups();
      if (res['success']) this.postsService.openSnackBar($localize`Successfully ran task!`);
      else this.postsService.openSnackBar($localize`Failed to run task!`);
    }, err => {
      this.postsService.openSnackBar($localize`Failed to run task!`);
      console.error(err);
    });
  }

  confirmTask(task_key: string): void {
    this.postsService.confirmTask(task_key).subscribe(res => {
      this.getTasks();
      if (res['success']) this.postsService.openSnackBar($localize`Successfully confirmed task!`);
      else this.postsService.openSnackBar($localize`Failed to confirm task!`);
    }, err => {
      this.postsService.openSnackBar($localize`Failed to confirm task!`);
      console.error(err);
    });
  }

  scheduleTask(task: any): void {
    // open dialog
    const dialogRef = this.dialog.open(UpdateTaskScheduleDialogComponent, {
      data: {
        task: task
      }
    });
    dialogRef.afterClosed().subscribe(schedule => {
      if (schedule || schedule === null) {
        this.postsService.updateTaskSchedule(task['key'], schedule).subscribe(res => {
          this.getTasks();
          console.log(res);
        });
      }
    });
  }

  getDBBackups(): void {
    this.postsService.getDBBackups().subscribe(res => {
      this.db_backups = res['db_backups'];
    });
  }

  openRestoreDBBackupDialog(): void {
    this.dialog.open(RestoreDbDialogComponent, {
      data: {
        db_backups: this.db_backups
      },
      width: '80vw'
    })
  }

  resetTasks(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: $localize`Reset tasks`,
        dialogText: $localize`Would you like to reset your tasks? All your schedules will be removed as well.`,
        submitText: $localize`Reset`,
        warnSubmitColor: true
      }
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.postsService.resetTasks().subscribe(res => {
          if (res['success']) {
            this.postsService.openSnackBar($localize`Tasks successfully reset!`);
          } else {
            this.postsService.openSnackBar($localize`Failed to reset tasks!`);
          }
        }, err => {
          this.postsService.openSnackBar($localize`Failed to reset tasks!`);
          console.error(err);
        });
      }
    });
  }

}

export interface Task {
  key: string;
  title: string;
  last_ran: number;
  last_confirmed: number;
  running: boolean;
  confirming: boolean;
  data: unknown;
}