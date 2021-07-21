import { Component, OnInit, Input, ViewChild, AfterViewInit } from '@angular/core';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { PostsService } from 'app/posts.services';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AddUserDialogComponent } from 'app/dialogs/add-user-dialog/add-user-dialog.component';
import { ManageUserComponent } from '../manage-user/manage-user.component';
import { ManageRoleComponent } from '../manage-role/manage-role.component';

@Component({
  selector: 'app-modify-users',
  templateUrl: './modify-users.component.html',
  styleUrls: ['./modify-users.component.scss']
})
export class ModifyUsersComponent implements OnInit, AfterViewInit {

  displayedColumns = ['name', 'role', 'actions'];
  dataSource = new MatTableDataSource();

  deleteDialogContentSubstring = 'Are you sure you want delete user ';

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  // MatPaginator Inputs
  length = 100;
  @Input() pageSize = 5;
  pageSizeOptions: number[] = [5, 10, 25, 100];

  // MatPaginator Output
  pageEvent: PageEvent;
  users: any;
  editObject = null;
  constructedObject = {};
  roles = null;


  constructor(public postsService: PostsService, public snackBar: MatSnackBar, public dialog: MatDialog,
    private dialogRef: MatDialogRef<ModifyUsersComponent>) { }

  ngOnInit() {
    this.getArray();
    this.getRoles();
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  /**
   * Set the paginator and sort after the view init since this component will
   * be able to query its view for the initialized paginator and sort.
   */
  afterGetData() {
    this.dataSource.sort = this.sort;
  }

  setPageSizeOptions(setPageSizeOptionsInput: string) {
    this.pageSizeOptions = setPageSizeOptionsInput.split(',').map(str => +str);
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim(); // Remove whitespace
    filterValue = filterValue.toLowerCase(); // Datasource defaults to lowercase matches
    this.dataSource.filter = filterValue;
  }

  private getArray() {
    this.postsService.getUsers().subscribe(res => {
      this.users = res['users'];
      this.createAndSortData();
      this.afterGetData();
    });
  }

  getRoles() {
    this.postsService.getRoles().subscribe(res => {
      this.roles = res['roles'];
    });
  }

  openAddUserDialog() {
    const dialogRef = this.dialog.open(AddUserDialogComponent);
    dialogRef.afterClosed().subscribe(user => {
      if (user && !user.error) {
        this.openSnackBar('Successfully added user ' + user.name);
        this.getArray();
      } else if (user && user.error) {
        this.openSnackBar('Failed to add user');
      }
    });
  }

  finishEditing(user_uid) {
    let has_finished = false;
    if (this.constructedObject && this.constructedObject['name'] && this.constructedObject['role']) {
      if (!isEmptyOrSpaces(this.constructedObject['name']) && !isEmptyOrSpaces(this.constructedObject['role'])) {
        has_finished = true;
        const index_of_object = this.indexOfUser(user_uid);
        this.users[index_of_object] = this.constructedObject;
        this.constructedObject = {};
        this.editObject = null;
        this.setUser(this.users[index_of_object]);
        this.createAndSortData();
      }
    }
  }

  enableEditMode(user_uid) {
    if (this.uidInUserList(user_uid) && this.indexOfUser(user_uid) > -1) {
      const users_index = this.indexOfUser(user_uid);
      this.editObject = this.users[users_index];
      this.constructedObject['name'] = this.users[users_index].name;
      this.constructedObject['uid'] = this.users[users_index].uid;
      this.constructedObject['role'] = this.users[users_index].role;
    }
  }

  disableEditMode() {
    this.editObject = null;
  }

  // checks if user is in users array by name
  uidInUserList(user_uid) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].uid === user_uid) {
        return true;
      }
    }
    return false;
  }

  // gets index of user in users array by name
  indexOfUser(user_uid) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].uid === user_uid) {
        return i;
      }
    }
    return -1;
  }

  setUser(change_obj) {
    this.postsService.changeUser(change_obj).subscribe(res => {
      this.getArray();
    });
  }

  manageUser(user_uid) {
    const index_of_object = this.indexOfUser(user_uid);
    const user_obj = this.users[index_of_object];
    this.dialog.open(ManageUserComponent, {
      data: {
        user: user_obj
      },
      width: '65vw'
    });
  }

  removeUser(user_uid) {
    this.postsService.deleteUser(user_uid).subscribe(res => {
      this.getArray();
    }, err => {
      this.getArray();
    });
  }

  createAndSortData() {
    // Sorts the data by last finished
    this.users.sort((a, b) => b.name > a.name);

    const filteredData = [];
    for (let i = 0; i < this.users.length; i++) {
      filteredData.push(JSON.parse(JSON.stringify(this.users[i])));
    }

    // Assign the data to the data source for the table to render
    this.dataSource.data = filteredData;
  }

  openModifyRole(role) {
    const dialogRef = this.dialog.open(ManageRoleComponent, {
      data: {
        role: role
      }
    });

    dialogRef.afterClosed().subscribe(success => {
      this.getRoles();
    });
  }

  closeDialog() {
    this.dialogRef.close();
  }

  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}

function isEmptyOrSpaces(str){
  return str === null || str.match(/^ *$/) !== null;
}
