import requests
import concurrent.futures
import time

playlist_file = "playlist.txt" # A file that contains a list of youtube links, each link on a separate line
api_key = "YOUR_API_KEY"
base_url = "http://YOUR_IP_ADDRESS:17442"
api_endpoint = f"{base_url}/api/downloadFile?apiKey={api_key}"
check_endpoint = f"{base_url}/api/download?apiKey={api_key}"
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}

# Download function
def download_file(url):
    # Make a POST request to initiate the download
    time.sleep(5)
    response = requests.post(api_endpoint, headers=headers, json={"url": url, "type": "audio", "cropFileSettings": {"cropFileStart": 0, "cropFileEnd": 0}})
    if response.status_code == 200:
        download_uid = response.json().get("download").get("uid")
        if download_uid:
            print(f"Downloading file: {url}")
            while True:
                # Make a POST request to check the download status
                response = requests.post(check_endpoint, headers=headers, json={"download_uid": download_uid})
                if response.status_code == 200:
                    download_status = response.json().get("download")
                    if download_status and download_status.get("finished"):
                        print(f"Download finished: {download_status.get('title')}")
                        break
                    else:
                        time.sleep(2)
                else:
                    print(f"Failed to check download status: {response.status_code}")
                    break
        else:
            print(f"Failed to retrieve download UID from response")
    else:
        print(f"Failed to initiate download: {response.status_code}")


# Main function
def main():
    # Read playlist file
    with open(playlist_file, "r") as file:
        urls = [line.strip() for line in file]

    # Use ThreadPoolExecutor to run download_file function concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        executor.map(download_file, urls)


if __name__ == "__main__":
    main()