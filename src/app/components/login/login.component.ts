import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  usernameInput = '';
  passwordInput = '';
  registrationEnabled = true;
  loggingIn = false;

  constructor(private postsService: PostsService) { }

  ngOnInit(): void {
  }

  login() {
    this.loggingIn = true;
    this.postsService.login(this.usernameInput, this.passwordInput).subscribe(res => {
      this.loggingIn = false;
      console.log(res);
    }, err => {
      this.loggingIn = false;
    });
  }

}
