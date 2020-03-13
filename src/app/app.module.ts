import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import {MatNativeDateModule, MatRadioModule, MatInputModule, MatButtonModule, MatSidenavModule, MatIconModule, MatListModule,
  MatSnackBarModule, MatCardModule, MatSelectModule, MatToolbarModule, MatCheckboxModule, MatGridListModule,
  MatProgressBarModule, MatExpansionModule,
  MatProgressSpinnerModule,
  MatButtonToggleModule,
  MatDialogModule,
  MatRippleModule,
  MatSlideToggleModule,
  MatMenuModule} from '@angular/material';
  import {DragDropModule} from '@angular/cdk/drag-drop';
  import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { AppComponent } from './app.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { HttpModule } from '@angular/http';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { PostsService } from 'app/posts.services';
import { FileCardComponent } from './file-card/file-card.component';
import {RouterModule} from '@angular/router';
import { AppRoutingModule } from './app-routing.module';
import { MainComponent } from './main/main.component';
import { PlayerComponent } from './player/player.component';
import {VgCoreModule} from 'videogular2/compiled/core';
import {VgControlsModule} from 'videogular2/compiled/controls';
import {VgOverlayPlayModule} from 'videogular2/compiled/overlay-play';
import {VgBufferingModule} from 'videogular2/compiled/buffering';
import { InputDialogComponent } from './input-dialog/input-dialog.component';
import { LazyLoadImageModule, IsVisibleProps } from 'ng-lazyload-image';
import { NgxContentLoadingModule } from 'ngx-content-loading';
import { audioFilesMouseHovering, videoFilesMouseHovering, audioFilesOpened, videoFilesOpened } from './main/main.component';
import { CreatePlaylistComponent } from './create-playlist/create-playlist.component';
import { DownloadItemComponent } from './download-item/download-item.component';
import { SubscriptionsComponent } from './subscriptions/subscriptions.component';
import { SubscribeDialogComponent } from './dialogs/subscribe-dialog/subscribe-dialog.component';
import { SubscriptionComponent } from './subscription//subscription/subscription.component';
import { SubscriptionFileCardComponent } from './subscription/subscription-file-card/subscription-file-card.component';
import { SubscriptionInfoDialogComponent } from './dialogs/subscription-info-dialog/subscription-info-dialog.component';
import { SettingsComponent } from './settings/settings.component';
import { CheckOrSetPinDialogComponent } from './dialogs/check-or-set-pin-dialog/check-or-set-pin-dialog.component';

export function isVisible({ event, element, scrollContainer, offset }: IsVisibleProps<any>) {
  return (element.id === 'video' ? videoFilesMouseHovering || videoFilesOpened : audioFilesMouseHovering || audioFilesOpened);
}

@NgModule({
  declarations: [
    AppComponent,
    FileCardComponent,
    MainComponent,
    PlayerComponent,
    InputDialogComponent,
    CreatePlaylistComponent,
    DownloadItemComponent,
    SubscriptionsComponent,
    SubscribeDialogComponent,
    SubscriptionComponent,
    SubscriptionFileCardComponent,
    SubscriptionInfoDialogComponent,
    SettingsComponent,
    CheckOrSetPinDialogComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatNativeDateModule,
    MatRadioModule,
    FormsModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    HttpModule,
    HttpClientModule,
    MatToolbarModule,
    MatCardModule,
    MatSnackBarModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatGridListModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatRippleModule,
    MatMenuModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatMenuModule,
    DragDropModule,
    VgCoreModule,
    VgControlsModule,
    VgOverlayPlayModule,
    VgBufferingModule,
    LazyLoadImageModule.forRoot({ isVisible }),
    NgxContentLoadingModule,
    RouterModule,
    AppRoutingModule,
  ],
  entryComponents: [
    InputDialogComponent,
    CreatePlaylistComponent,
    SubscribeDialogComponent,
    SubscriptionInfoDialogComponent,
    SettingsComponent,
    CheckOrSetPinDialogComponent
  ],
  providers: [PostsService],
  bootstrap: [AppComponent]
})
export class AppModule { }
