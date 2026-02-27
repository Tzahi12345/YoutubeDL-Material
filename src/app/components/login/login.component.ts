import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    standalone: false
})
export class LoginComponent implements OnInit {

  selectedTabIndex = 0;

  // login
  loginUsernameInput = '';
  loginPasswordInput = '';
  loggingIn = false;

  // registration
  registrationEnabled = false;
  registrationUsernameInput = '';
  registrationPasswordInput = '';
  registrationPasswordConfirmationInput = '';
  registering = false;
  oidcEnabled = false;
  oidcRedirecting = false;
  returnTo = '/home';

  constructor(private postsService: PostsService, private snackBar: MatSnackBar, private router: Router, private route: ActivatedRoute) { }

  ngOnInit(): void {
    const routeReturnTo = this.route.snapshot.queryParamMap.get('returnTo');
    this.returnTo = routeReturnTo && routeReturnTo.startsWith('/') ? routeReturnTo : '/home';

    const oidcToken = this.route.snapshot.paramMap.get('oidc_token');
    const oidcRedirectPath = this.route.snapshot.paramMap.get('redirect');
    if (oidcToken) {
      const redirectPath = oidcRedirectPath && oidcRedirectPath.startsWith('/') ? oidcRedirectPath : this.returnTo;
      this.postsService.completeOIDCLogin(oidcToken, redirectPath);
      return;
    }

    if (this.postsService.isLoggedIn && localStorage.getItem('jwt_token') !== 'null') {
      this.router.navigate(['/home']);
    }
    this.postsService.service_initialized
      .pipe(filter(Boolean), take(1))
      .subscribe(() => {
        if (!this.postsService.config['Advanced']['multi_user_mode']) {
          this.router.navigate(['/home']);
          return;
        }
        this.oidcEnabled = this.postsService.isOIDCEnabled();
        if (this.oidcEnabled) {
          this.redirectToOIDC();
          return;
        }
        this.registrationEnabled = this.postsService.config['Users'] && this.postsService.config['Users']['allow_registration'];
      });
  }

  login() {
    if (this.loginPasswordInput === '') {
      return;
    }
    this.loggingIn = true;
    this.postsService.login(this.loginUsernameInput, this.loginPasswordInput).subscribe(res => {
      this.loggingIn = false;
      if (res['token']) {
        this.postsService.afterLogin(res['user'], res['token'], res['permissions'], res['available_permissions'], this.returnTo);
      } else {
        this.openSnackBar('Login failed, unknown error.');
      }
    }, err => {
      this.loggingIn = false;
      const error_code = err.status;
      if (error_code === 401) {
        this.openSnackBar('User name or password is incorrect!');
      } else if (error_code === 404) {
        this.openSnackBar('Login failed, cannot connect to the server.');
      } else {
        this.openSnackBar('Login failed, unknown error.');
      }
    });
  }

  register() {
    if (!this.registrationUsernameInput || this.registrationUsernameInput === '') {
      this.openSnackBar('User name is required!');
      return;
    }

    if (!this.registrationPasswordInput || this.registrationPasswordInput === '') {
      this.openSnackBar('Password is required!');
      return;
    }

    if (!this.registrationPasswordConfirmationInput || this.registrationPasswordConfirmationInput === '') {
      this.openSnackBar('Password confirmation is required!');
      return;
    }

    if (this.registrationPasswordInput !== this.registrationPasswordConfirmationInput) {
      this.openSnackBar('Password confirmation is incorrect!');
      return;
    }

    this.registering = true;
    this.postsService.register(this.registrationUsernameInput, this.registrationPasswordInput).subscribe(res => {
      this.registering = false;
      if (res && res['user']) {
        this.openSnackBar(`User ${res['user']['name']} successfully registered.`);
        this.loginUsernameInput = res['user']['name'];
        this.selectedTabIndex = 0;
      } else {
        this.openSnackBar('Failed to register user, unknown error.');
      }
    }, err => {
      this.registering = false;
      if (err && err.error && typeof err.error === 'string') {
        this.openSnackBar(err.error);
      } else {
        console.log(err);
      }
    });
  }

  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

  redirectToOIDC() {
    if (this.oidcRedirecting) {
      return;
    }
    this.oidcRedirecting = true;
    window.location.href = this.postsService.getOIDCLoginURL(this.returnTo || '/home');
  }

}
