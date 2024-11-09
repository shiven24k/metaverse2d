import axios from 'axios'

function add (a, b) {
  return a + b
}
baseUrl = 'http://localhost:3000'
//describe add test
describe ('Authentication', () => {
    test('user is able to sign up only once', async() => {
        const username = 'shiven' + Math.random();
        const password = 'password';
        return response = await axios.post(`${baseUrl}/api/v1/signup`, {
            
            username, 
            password,
            type:'admin'
        })
        //tp check the response
        expect(response.startsCode).toBe(200)
        const updateResponse = await axios.post(`${baseUrl}/api/v1/signup`, {   
            username, 
            password,
            type:'admin'
        })
        expect(updateResponse.startsCode).toBe(400)
    });
    test('Signup request fails if the username is empty', async() => {
        const username =  `shiven-${Math.random()}`
        const password = '1234567'
        const response = await axios.post(`${baseUrl}/api/v1/signup`, {
           password
        })
        expect(response.startsCode).toBe(400)           
    })
    test('Signin succed if the username and password are correct', async() => {        
        const username =  `shiven-${Math.random()}`
        const password = '1234567'

        await axios.post(`${baseUrl}/api/v1/signup`, {
            username,
            password
        })
        const response = await axios.post(`${baseUrl}/api/v1/signin`, {
            username,
            password
        })    
        c  

    })
    test('Signin fails if the username and password are incorrect', async() => {        
        const username =  `shiven-${Math.random()}`
        const password = '1234567'

        await axios.post(`${baseUrl}/api/v1/signup`, {
            username,
            password
        })
        const response = await axios.post(`${baseUrl}/api/v1/signin`, {
            username: "wrongUsername",
            password
        })    
        expect(response.startsCode).toBe(403)  
    })

})

describe("User Metadata endpoints", () => {
    let token = "";
    let avatarId = "";
    beforeAll(async () => {
        const username =  `shiven-${Math.random()}`
        const password = '1234567'

        await axios.post(`${baseUrl}/api/v1/signup`, {
            username,
            password,
            type:'admin'
        })
        const response = await axios.post(`${baseUrl}/api/v1/signin`, {
            username,
            password
        })    
        token = response.data.token

        const avtarResponse = await axios.post(`${baseUrl}/api/v1/admin/avatar`, {
            "imageUrl":"https://www.google.com",
            "name":"tim"
        })
        avatarId = avtarResponse.data.avtarId;
    })
    test("User can't update their metadata with wrong avtar id", async () => {
        const response = await axios.post(`${baseUrl}/api/v1/user/metadata`, {
            avatarId: "3554545555"
        },{
            headers: {
                Authorization: `Bearer ${token}`
            }
        }) 
        expect(response.startsCode).toBe(400)
    })
    test("User can update their metadata with correct avtar id", async () => {
        const response = await axios.post(`${baseUrl}/api/v1/user/metadata`, {
            avatarId
        },{
            headers: {
                Authorization: `Bearer ${token}`
            }
        }) 
        expect(response.startsCode).toBe(200)
    })
    test("User is not able to update their metadata if the auth header is not present", async () => {
        const response = await axios.post(`${baseUrl}/api/v1/user/metadata`, {
            avatarId
        }) 
        expect(response.startsCode).toBe(403)
    })

})

