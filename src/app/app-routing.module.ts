import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';
import { PlayerComponent } from './player/player.component';
import { SubscriptionsComponent } from './subscriptions/subscriptions.component';
import { SubscriptionComponent } from './subscription/subscription/subscription.component';
const routes: Routes = [
  { path: 'home', component: MainComponent },
  { path: 'player', component: PlayerComponent},
  { path: 'subscriptions', component: SubscriptionsComponent },
  { path: 'subscription', component: SubscriptionComponent },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
