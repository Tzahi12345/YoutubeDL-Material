import platform
import requests
import shutil
import os
import re

from github import Github

machine = platform.machine()

def isARM():
    return True if machine.startswith('arm') else False

def getLatestFileInRepo(repo, search_string):
    # Create an unauthenticated instance of the Github object
    g = Github(os.environ.get('GH_TOKEN'))

    # Replace with the repository owner and name
    repo = g.get_repo(repo)

    # Get all releases of the repository
    releases = repo.get_releases()

    # Loop through the releases in reverse order (from latest to oldest)
    for release in list(releases):
        # Get the release assets (files attached to the release)
        assets = release.get_assets()

        # Loop through the assets
        for asset in assets:
            if re.search(search_string, asset.name):
                print(f'Downloading: {asset.name}')
                response = requests.get(asset.browser_download_url)
                with open(asset.name, 'wb') as f:
                    f.write(response.content)
                print(f'Download complete: {asset.name}. Unzipping...')
                shutil.unpack_archive(asset.name, './')
                print(f'Unzipping complete!')
                os.remove(asset.name)
                break
        else:
            continue
        break
    else:
        # If no matching release is found, print a message
        print(f'No release found with {search_string}')

def getLatestCLIRelease():
    isArm = isARM()
    searchString = r'.*CLI.*' + "LinuxArm.zip" if isArm else "Linux-x64.zip"
    getLatestFileInRepo("lay295/TwitchDownloader", searchString)

getLatestCLIRelease()