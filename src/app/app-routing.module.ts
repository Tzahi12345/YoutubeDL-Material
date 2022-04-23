import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';
import { PlayerComponent } from './player/player.component';
import { SubscriptionsComponent } from './subscriptions/subscriptions.component';
import { SubscriptionComponent } from './subscription/subscription/subscription.component';
import { PostsService } from './posts.services';
import { LoginComponent } from './components/login/login.component';
import { DownloadsComponent } from './components/downloads/downloads.component';
import { SettingsComponent } from './settings/settings.component';
import { TasksComponent } from './components/tasks/tasks.component';

const routes: Routes = [
  { path: 'home', component: MainComponent, canActivate: [PostsService] },
  { path: 'player', component: PlayerComponent, canActivate: [PostsService]},
  { path: 'subscriptions', component: SubscriptionsComponent, canActivate: [PostsService] },
  { path: 'subscription', component: SubscriptionComponent, canActivate: [PostsService] },
  { path: 'settings', component: SettingsComponent, canActivate: [PostsService] },
  { path: 'login', component: LoginComponent },
  { path: 'downloads', component: DownloadsComponent, canActivate: [PostsService] },
  { path: 'tasks', component: TasksComponent, canActivate: [PostsService] },
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true, relativeLinkResolution: 'legacy' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
